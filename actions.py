"""Catalogue d'actions et point d'exécution unique (boutons, commandes, programmations, automatismes)."""
from datetime import datetime

import bec
import db
import heating
from datetime import timedelta

from config import (BEC_ABSENCE, BEC_HOME, BEC_LEAD_MIN, BEC_PRESETS, RETURN_FALLBACK_H, RETURN_RADS_MAX_H,
                    log, now)
from util import fr_dt, hc_starts

ACTIONS = {
    "HOME": "Tout en maison",
    "ABSENCE": "Tout en absence",
    "RADS_HOME": "Chauffage maison",
    "RADS_ABSENCE": "Chauffage absence",
    **{f"BEC_{p}": f"Eau chaude {p} %" for p in BEC_PRESETS},
    "EAU_MAISON": f"Eau chaude {BEC_HOME[0]} % tous les jours",
}


def weekend_boost() -> bool:
    return db.state_get("bec_we100", "1") == "1"


def bec_pair(pct: int) -> tuple[int, int]:
    return pct, (100 if weekend_boost() else pct)


def _bec_text(s: dict, sem: int, we: int) -> str:
    q = s["qte"]
    if s["ok"]:
        return f"✅ Eau chaude : lun-ven {sem} %, sam-dim {we} %"
    jours = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"]
    lus = " ".join(f"{j} {v if v is not None else '?'}" for j, v in zip(jours, q))
    return f"⚠️ Eau chaude partiellement prise en compte : {lus} %"


async def run(action: str, by: str) -> str:
    """Exécute une action du catalogue et renvoie un compte rendu HTML court."""
    out = []
    try:
        if action in ("HOME", "ABSENCE", "RADS_HOME", "RADS_ABSENCE"):
            mode = "HOME" if action.endswith("HOME") else "ABSENCE"
            out.append(("🏠 Chauffage maison" if mode == "HOME" else "❄️ Chauffage absence"))
            out += await heating.apply_mode(mode, by)
        if action in ("HOME", "ABSENCE", "EAU_MAISON") or action.startswith("BEC_"):
            if action in ("HOME", "EAU_MAISON"):
                sem, we = BEC_HOME
            elif action == "ABSENCE":
                sem, we = BEC_ABSENCE
            else:
                sem, we = bec_pair(int(action.split("_")[1]))
            out.append(_bec_text(await bec.set_quantites(sem, we, by), sem, we))
    except Exception as e:
        log(f"Action {action} ERR: {e}")
        out.append(f"⚠️ {e}")
    return "\n".join(out) if out else "❓ Action inconnue"


# ── Retour d'absence ────────────────────────────────────────────────────────
def return_plan(ret, ref=None) -> list[tuple]:
    """Programmations du retour : (quand, action, explication).

    Eau chaude : réglée à 80 % juste avant la dernière plage HC qui commence avant le retour,
    pour que le ballon chauffe en heures creuses et soit plein le soir.
    Radiateurs : relancés au début de la dernière plage HC des RETURN_RADS_MAX_H heures avant le retour,
    sinon RETURN_FALLBACK_H heures avant.
    """
    ref = ref or now()
    soon = ref + timedelta(minutes=5)
    starts = hc_starts(ref - timedelta(hours=3), ret)
    plan = []
    bec_hc = [s for s in starts if s < ret - timedelta(hours=1)]
    if bec_hc:
        s = bec_hc[-1]
        plan.append((max(s - timedelta(minutes=BEC_LEAD_MIN), soon), "EAU_MAISON",
                     f"chauffe en heures creuses dès {s:%Hh%M}"))
    else:
        plan.append((max(ret - timedelta(hours=RETURN_FALLBACK_H), soon), "EAU_MAISON", "pas d'heures creuses avant"))
    rad_hc = [s for s in starts if ret - timedelta(hours=RETURN_RADS_MAX_H) <= s <= ret - timedelta(hours=1)]
    if rad_hc:
        plan.append((max(rad_hc[-1], soon), "RADS_HOME", "début des heures creuses"))
    else:
        plan.append((max(ret - timedelta(hours=RETURN_FALLBACK_H), soon), "RADS_HOME",
                     f"{RETURN_FALLBACK_H:g} h avant, pas d'heures creuses avant"))
    plan = [(t, a, "retour proche : dès maintenant" if t == soon else why) for t, a, why in plan]
    return sorted(plan, key=lambda p: p[0])


# ── Programmations (liste en mémoire, base écrite seulement quand elle change) ──
_progs: dict[int, dict] = {}
_local_id = 0


def _row(pid, run_at, action, by, source) -> dict:
    return {"id": pid, "run_at": run_at, "action": action, "by": by, "source": source,
            "label": f"{fr_dt(run_at)} · {ACTIONS.get(action, action)}"}


def prog_load():
    """Au démarrage : remet en attente les exécutions interrompues et charge les programmations futures."""
    db.execute("UPDATE programmations SET status='pending' WHERE status='running'")
    _progs.clear()
    for r in db.query("SELECT id, run_at, action, created_by, source FROM programmations WHERE status='pending'"):
        _progs[r[0]] = _row(*r)


def prog_add(run_at: datetime, action: str, by: str, source: str = "manuel") -> int:
    global _local_id
    pid = db.execute("INSERT INTO programmations (run_at, action, created_by, source) VALUES (%s,%s,%s,%s) "
                     "RETURNING id", (run_at, action, by, source))
    if pid is None:                 # base injoignable : la programmation fonctionne quand même (mémoire)
        _local_id -= 1
        pid = _local_id
    _progs[pid] = _row(pid, run_at, action, by, source)
    return pid


def prog_pending() -> list[dict]:
    return sorted(_progs.values(), key=lambda p: p["run_at"])


def prog_cancel(pid: int, by: str) -> bool:
    if _progs.pop(pid, None) is None:
        return False
    if pid > 0:
        db.execute("UPDATE programmations SET status='cancelled', result=%s WHERE id=%s AND status='pending'",
                   (f"annulé par {by}", pid))
    return True


def prog_cancel_source(source: str, by: str) -> int:
    """Annule toutes les programmations en attente d'une origine donnée (ex. retours d'absence)."""
    ids = [p["id"] for p in prog_pending() if p["source"] == source]
    return sum(prog_cancel(i, by) for i in ids)


def prog_due() -> list[dict]:
    t = now()
    due = [p for p in prog_pending() if p["run_at"] <= t]
    for p in due:
        del _progs[p["id"]]
    return due


def prog_done(pid: int, result: str):
    if pid > 0:
        db.execute("UPDATE programmations SET status='done', result=%s WHERE id=%s", (result[:500], pid))

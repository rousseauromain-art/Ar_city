"""Configuration : variables d'environnement Koyeb et constantes."""
import os
from datetime import datetime
from zoneinfo import ZoneInfo

from pyoverkiz.const import SUPPORTED_SERVERS

VERSION = "2.1"
TZ = ZoneInfo("Europe/Paris")          # Koyeb tourne en UTC : toute l'heure passe par ici


def now() -> datetime:
    return datetime.now(TZ)


def log(msg: str):
    print(f"[{now():%d/%m %H:%M:%S}] {msg}", flush=True)


def _int_set(raw: str) -> set[int]:
    return {int(x) for x in raw.replace(" ", "").split(",") if x.lstrip("-").isdigit()}


def _plages(raw: str) -> list[tuple[int, int]]:
    """'00:56-06:26,14:26-16:56' -> [(56, 386), (866, 1016)] en minutes ; gère le passage de minuit."""
    out = []
    for part in raw.replace(" ", "").split(","):
        if "-" not in part:
            continue
        a, b = part.split("-")
        ma = int(a.split(":")[0]) * 60 + int(a.split(":")[1])
        mb = int(b.split(":")[0]) * 60 + int(b.split(":")[1])
        out += [(ma, mb)] if ma < mb else [(ma, 1440), (0, mb)]
    return out


# ── Telegram ────────────────────────────────────────────────────────────────
TOKEN = os.getenv("TELEGRAM_TOKEN")
# Identifiants Telegram autorisés, séparés par des virgules. Vide = bot fermé à tous.
ALLOWED_USER_IDS = _int_set(os.getenv("ALLOWED_USER_IDS", ""))

# ── Overkiz (radiateurs) ────────────────────────────────────────────────────
OVERKIZ_EMAIL = os.getenv("OVERKIZ_EMAIL")
OVERKIZ_PASSWORD = os.getenv("OVERKIZ_PASSWORD")
MY_SERVER = SUPPORTED_SERVERS["atlantic_cozytouch"]

# ── Atlantic Magellan (ballon) ──────────────────────────────────────────────
ATLANTIC_API = "https://apis.groupe-atlantic.com"
CLIENT_BASIC = "Q3RfMUpWeVRtSUxYOEllZkE3YVVOQmpGblpVYToyRWNORHpfZHkzNDJVSnFvMlo3cFNKTnZVdjBh"
BEC_USER = os.getenv("BEC_EMAIL")
BEC_PASS = os.getenv("BEC_PASSWORD")

# ── Shelly ──────────────────────────────────────────────────────────────────
SHELLY_TOKEN = os.getenv("SHELLY_TOKEN")
SHELLY_ID = os.getenv("SHELLY_ID")
SHELLY_SERVER = os.getenv("SHELLY_SERVER", "shelly-209-eu.shelly.cloud")
SHELLY_ROOM = os.getenv("SHELLY_ROOM", "Salon")   # pièce dont le Shelly mesure l'ambiance

# ── Base ────────────────────────────────────────────────────────────────────
DB_URL = os.getenv("DATABASE_URL")
OLD_DB_URL = os.getenv("OLD_DATABASE_URL")                # migration ponctuelle, à retirer ensuite
DB_FLUSH_HOURS = float(os.getenv("DB_FLUSH_HOURS", "6"))  # écriture groupée des relevés

# ── Heures creuses du contrat (à vérifier sur la facture) ───────────────────
HC_PLAGES = _plages(os.getenv("HC_PLAGES", "00:56-06:26,14:26-16:56"))

# ── Radiateurs : valeurs initiales, ensuite stockées et modifiables en base ─
ROOMS_DEFAULT = {
    "14253355#1": {"name": "Salon",           "confort": 19.5, "eco": 16.0},
    "190387#1":   {"name": "Chambre",         "confort": 19.0, "eco": 16.0},
    "1640746#1":  {"name": "Bureau",          "confort": 18.0, "eco": 15.0},
    "4326513#1":  {"name": "Sèche-serviette", "confort": 19.5, "eco": 16.0},
}

# ── Ballon ──────────────────────────────────────────────────────────────────
BEC_PRESETS = (60, 70, 80, 100)
# Retour d'absence : relance en heures creuses
RETURN_RADS_MAX_H = float(os.getenv("RETURN_RADS_MAX_H", "9"))  # relance radiateurs au plus tôt N h avant
RETURN_FALLBACK_H = float(os.getenv("RETURN_FALLBACK_H", "3"))  # sans HC possible : N h avant le retour
BEC_LEAD_MIN = 20                                               # réglage du ballon N min avant la plage HC
BEC_HOME = (80, 80)          # (semaine, week-end) en mode maison : tous les jours à 80 %
BEC_ABSENCE = (70, 70)       # en mode absence
BEC_GUARD_PCT = 60           # à ce niveau ou en dessous…
BEC_GUARD_DAYS = 4           # …pendant ce nombre de jours → passage auto à 70 %
BEC_SAMPLE_MIN = 15          # relevé du ballon toutes les 15 min

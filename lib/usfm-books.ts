// Book identification for free-typed Scripture references.
//
// The alias, ordinal and numbered-book tables below are ported from
// youversion/usfm-references, MIT licensed, Copyright (c) 2018 Brad Belyeu.
// See LICENSES/usfm-references-MIT.txt for the full licence text.
//
// They replace a hand-rolled list that had grown inconsistent — "Jn 1:1"
// parsed while "Mt 5:9" did not, and none of "I Corinthians",
// "First John" or "III John" worked at all, which is how a good share of
// ministers actually write a reference. The deuterocanonical books matter too:
// the reader offers the KJV with Apocrypha and the Catholic Public Domain
// Version, so Sirach and Tobit were content nobody could look up.
//
// Display names are ours, not theirs.

/** Every spelling and abbreviation of a single-name book. */
export const BOOK_ALIASES: Record<string, string> = {
  "genesis": "GEN",
  "gen": "GEN",
  "gn": "GEN",
  "exodus": "EXO",
  "exod": "EXO",
  "exo": "EXO",
  "ex": "EXO",
  "leviticus": "LEV",
  "lev": "LEV",
  "lv": "LEV",
  "numbers": "NUM",
  "num": "NUM",
  "nm": "NUM",
  "deuteronomy": "DEU",
  "deut": "DEU",
  "deu": "DEU",
  "dt": "DEU",
  "joshua": "JOS",
  "josh": "JOS",
  "jos": "JOS",
  "jsh": "JOS",
  "judges": "JDG",
  "judg": "JDG",
  "jdg": "JDG",
  "jdgs": "JDG",
  "ruth": "RUT",
  "rut": "RUT",
  "rth": "RUT",
  "ezra": "EZR",
  "ezr": "EZR",
  "nehemiah": "NEH",
  "neh": "NEH",
  "esther": "EST",
  "esth": "EST",
  "est": "EST",
  "job": "JOB",
  "jb": "JOB",
  "psalms": "PSA",
  "psalm": "PSA",
  "psa": "PSA",
  "pss": "PSA",
  "psm": "PSA",
  "ps": "PSA",
  "proverbs": "PRO",
  "prov": "PRO",
  "pro": "PRO",
  "prv": "PRO",
  "ecclesiastes": "ECC",
  "eccles": "ECC",
  "eccl": "ECC",
  "ecc": "ECC",
  "qoh": "ECC",
  "qoheleth": "ECC",
  "songofsongs": "SNG",
  "songofsolomon": "SNG",
  "song": "SNG",
  "sng": "SNG",
  "sos": "SNG",
  "canticles": "SNG",
  "cant": "SNG",
  "isaiah": "ISA",
  "isa": "ISA",
  "jeremiah": "JER",
  "jer": "JER",
  "lamentations": "LAM",
  "lam": "LAM",
  "ezekiel": "EZK",
  "ezek": "EZK",
  "ezk": "EZK",
  "eze": "EZK",
  "daniel": "DAN",
  "dan": "DAN",
  "dn": "DAN",
  "hosea": "HOS",
  "hos": "HOS",
  "joel": "JOL",
  "jol": "JOL",
  "jl": "JOL",
  "amos": "AMO",
  "amo": "AMO",
  "obadiah": "OBA",
  "obad": "OBA",
  "oba": "OBA",
  "ob": "OBA",
  "jonah": "JON",
  "jon": "JON",
  "jnh": "JON",
  "micah": "MIC",
  "mic": "MIC",
  "nahum": "NAM",
  "nah": "NAM",
  "nam": "NAM",
  "habakkuk": "HAB",
  "hab": "HAB",
  "hb": "HAB",
  "zephaniah": "ZEP",
  "zeph": "ZEP",
  "zep": "ZEP",
  "haggai": "HAG",
  "hag": "HAG",
  "hg": "HAG",
  "zechariah": "ZEC",
  "zech": "ZEC",
  "zec": "ZEC",
  "malachi": "MAL",
  "mal": "MAL",
  "matthew": "MAT",
  "matt": "MAT",
  "mat": "MAT",
  "mt": "MAT",
  "mark": "MRK",
  "mrk": "MRK",
  "mar": "MRK",
  "mk": "MRK",
  "luke": "LUK",
  "luk": "LUK",
  "lk": "LUK",
  "john": "JHN",
  "jhn": "JHN",
  "jn": "JHN",
  "acts": "ACT",
  "act": "ACT",
  "romans": "ROM",
  "rom": "ROM",
  "galatians": "GAL",
  "gal": "GAL",
  "ephesians": "EPH",
  "eph": "EPH",
  "philippians": "PHP",
  "phil": "PHP",
  "php": "PHP",
  "colossians": "COL",
  "col": "COL",
  "titus": "TIT",
  "tit": "TIT",
  "philemon": "PHM",
  "philem": "PHM",
  "phlm": "PHM",
  "phm": "PHM",
  "hebrews": "HEB",
  "heb": "HEB",
  "james": "JAS",
  "jas": "JAS",
  "jude": "JUD",
  "jud": "JUD",
  "revelation": "REV",
  "rev": "REV",
  "rv": "REV",
  "apocalypse": "REV",
  "apoc": "REV",
  "tobit": "TOB",
  "tob": "TOB",
  "tb": "TOB",
  "judith": "JDT",
  "jdt": "JDT",
  "jdth": "JDT",
  "wisdomofsolomon": "WIS",
  "wisdom": "WIS",
  "wis": "WIS",
  "wissol": "WIS",
  "sirach": "SIR",
  "ecclesiasticus": "SIR",
  "sir": "SIR",
  "bensira": "SIR",
  "baruch": "BAR",
  "bar": "BAR",
  "letterofjeremiah": "LJE",
  "letjer": "LJE",
  "lje": "LJE",
  "epistleofjeremiah": "LJE",
  "songofthethreeyoungmen": "S3Y",
  "songofthree": "S3Y",
  "prayerofazariah": "S3Y",
  "praz": "S3Y",
  "s3y": "S3Y",
  "susanna": "SUS",
  "sus": "SUS",
  "belandthedragon": "BEL",
  "bel": "BEL",
  "prayerofmanasseh": "MAN",
  "prman": "MAN"
};

/**
 * Books that take a leading number, keyed by stem then ordinal.
 *
 * The ordinal is normalized first — arabic (1), roman (II) or word (Third) —
 * then the stem is looked up here. An impossible ordinal such as "4 John"
 * simply finds nothing, which is the wanted answer.
 */
export const NUMBERED_BOOKS: Record<string, Record<string, string>> = {
  "samuel": {
    "1": "1SA",
    "2": "2SA"
  },
  "sam": {
    "1": "1SA",
    "2": "2SA"
  },
  "sa": {
    "1": "1SA",
    "2": "2SA"
  },
  "sm": {
    "1": "1SA",
    "2": "2SA"
  },
  "kings": {
    "1": "1KI",
    "2": "2KI"
  },
  "kgs": {
    "1": "1KI",
    "2": "2KI"
  },
  "kg": {
    "1": "1KI",
    "2": "2KI"
  },
  "ki": {
    "1": "1KI",
    "2": "2KI"
  },
  "chronicles": {
    "1": "1CH",
    "2": "2CH"
  },
  "chron": {
    "1": "1CH",
    "2": "2CH"
  },
  "chr": {
    "1": "1CH",
    "2": "2CH"
  },
  "ch": {
    "1": "1CH",
    "2": "2CH"
  },
  "corinthians": {
    "1": "1CO",
    "2": "2CO"
  },
  "cor": {
    "1": "1CO",
    "2": "2CO"
  },
  "co": {
    "1": "1CO",
    "2": "2CO"
  },
  "thessalonians": {
    "1": "1TH",
    "2": "2TH"
  },
  "thess": {
    "1": "1TH",
    "2": "2TH"
  },
  "thes": {
    "1": "1TH",
    "2": "2TH"
  },
  "th": {
    "1": "1TH",
    "2": "2TH"
  },
  "timothy": {
    "1": "1TI",
    "2": "2TI"
  },
  "tim": {
    "1": "1TI",
    "2": "2TI"
  },
  "ti": {
    "1": "1TI",
    "2": "2TI"
  },
  "peter": {
    "1": "1PE",
    "2": "2PE"
  },
  "pet": {
    "1": "1PE",
    "2": "2PE"
  },
  "pe": {
    "1": "1PE",
    "2": "2PE"
  },
  "john": {
    "1": "1JN",
    "2": "2JN",
    "3": "3JN"
  },
  "jn": {
    "1": "1JN",
    "2": "2JN",
    "3": "3JN"
  },
  "jhn": {
    "1": "1JN",
    "2": "2JN",
    "3": "3JN"
  },
  "jo": {
    "1": "1JN",
    "2": "2JN",
    "3": "3JN"
  },
  "maccabees": {
    "1": "1MA",
    "2": "2MA"
  },
  "macc": {
    "1": "1MA",
    "2": "2MA"
  },
  "mac": {
    "1": "1MA",
    "2": "2MA"
  },
  "ma": {
    "1": "1MA",
    "2": "2MA"
  },
  "esdras": {
    "1": "1ES",
    "2": "2ES"
  },
  "esd": {
    "1": "1ES",
    "2": "2ES"
  },
  "es": {
    "1": "1ES",
    "2": "2ES"
  }
};

export const ORDINAL_WORDS: Record<string, number> = {
  "first": 1,
  "second": 2,
  "third": 3
};
export const ROMAN_ORDINALS: Record<string, number> = {
  "i": 1,
  "ii": 2,
  "iii": 3
};

/** How each book is labelled back to the reader. */
export const BOOK_DISPLAY: Record<string, string> = {
  "GEN": "Genesis",
  "EXO": "Exodus",
  "LEV": "Leviticus",
  "NUM": "Numbers",
  "DEU": "Deuteronomy",
  "JOS": "Joshua",
  "JDG": "Judges",
  "RUT": "Ruth",
  "EZR": "Ezra",
  "NEH": "Nehemiah",
  "EST": "Esther",
  "JOB": "Job",
  "PSA": "Psalms",
  "PRO": "Proverbs",
  "ECC": "Ecclesiastes",
  "SNG": "Song of Solomon",
  "ISA": "Isaiah",
  "JER": "Jeremiah",
  "LAM": "Lamentations",
  "EZK": "Ezekiel",
  "DAN": "Daniel",
  "HOS": "Hosea",
  "JOL": "Joel",
  "AMO": "Amos",
  "OBA": "Obadiah",
  "JON": "Jonah",
  "MIC": "Micah",
  "NAM": "Nahum",
  "HAB": "Habakkuk",
  "ZEP": "Zephaniah",
  "HAG": "Haggai",
  "ZEC": "Zechariah",
  "MAL": "Malachi",
  "MAT": "Matthew",
  "MRK": "Mark",
  "LUK": "Luke",
  "JHN": "John",
  "ACT": "Acts",
  "ROM": "Romans",
  "GAL": "Galatians",
  "EPH": "Ephesians",
  "PHP": "Philippians",
  "COL": "Colossians",
  "TIT": "Titus",
  "PHM": "Philemon",
  "HEB": "Hebrews",
  "JAS": "James",
  "JUD": "Jude",
  "REV": "Revelation",
  "TOB": "Tobit",
  "JDT": "Judith",
  "WIS": "Wisdom of Solomon",
  "SIR": "Sirach",
  "BAR": "Baruch",
  "LJE": "Epistleofjeremiah",
  "S3Y": "Songofthethreeyoungmen",
  "SUS": "Susanna",
  "BEL": "Belandthedragon",
  "MAN": "Prayer of Manasseh",
  "1SA": "1 Samuel",
  "2SA": "2 Samuel",
  "1KI": "1 Kings",
  "2KI": "2 Kings",
  "1CH": "1 Chronicles",
  "2CH": "2 Chronicles",
  "1CO": "1 Corinthians",
  "2CO": "2 Corinthians",
  "1TH": "1 Thessalonians",
  "2TH": "2 Thessalonians",
  "1TI": "1 Timothy",
  "2TI": "2 Timothy",
  "1PE": "1 Peter",
  "2PE": "2 Peter",
  "1JN": "1 John",
  "2JN": "2 John",
  "3JN": "3 John",
  "1MA": "1 Maccabees",
  "2MA": "2 Maccabees",
  "1ES": "1 Esdras",
  "2ES": "2 Esdras"
};

import type { CatId, WeaponId } from "./game/types";

export type Language = "es" | "en";

export const LANGUAGES: Record<Language, string> = {
  es: "ES",
  en: "EN",
};

export const DEFAULT_LANGUAGE: Language = "es";
export const LANGUAGE_KEY = "fighting-cats.language";

export const UI_TEXT = {
  es: {
    homeTagline: "Entra, crea sala y pelea en arenas de plataformas.",
    homeDescription:
      "Un combate rapido y caotico entre gatos con mucho caracter: salta entre tejados, recoge armas absurdas, esquiva trampas y demuestra quien manda en la arena.",
    yourName: "Tu nombre",
    quickPlay: "Quick play",
    createRoom: "Crear sala",
    joinRoom: "Unirse a sala",
    roomCode: "Codigo de sala",
    enter: "Entrar",
    roomNotFound: "Sala no encontrada o llena",
    back: "Volver",
    leave: "Salir",
    visibility: "Visibilidad",
    public: "Publica",
    private: "Privada",
    type: "Tipo",
    standardMode: "Standard: 5 mapas",
    customMode: "Custom",
    players: "Jugadores",
    player: "Jugador",
    rounds: "Rondas",
    startingWeapon: "Arma inicial",
    customMaps: "Mapas custom",
    play: "Jugar",
    publicRoom: "Sala publica",
    privateRoom: "Sala privada",
    freeSlots: "slots libres",
    yourCat: "Tu gato",
    chooseFighter: "Elige luchador",
    occupiedBy: "Ocupado por",
    selectedCat: "Tu gato",
    free: "Libre",
    mode: "Modo",
    maps: "Mapas",
    alive: "Vivos",
    weapon: "Arma",
    round: "Ronda",
    winsRound: "gana la ronda",
    result: "Resultado",
    playAgain: "Otra partida",
    menu: "Menu",
    controlsTitle: "Controles",
    controlsMove: "Moverse",
    controlsJump: "Saltar",
    controlsAttack: "Atacar / usar arma",
    controlsThrow: "Lanzar arma especial",
    controlsMobile: "En movil usa los botones tactiles de pantalla.",
  },
  en: {
    homeTagline: "Join a room and fight across platform arenas.",
    homeDescription:
      "A fast, chaotic cat brawler: leap across rooftops, grab ridiculous weapons, dodge traps, and prove who rules the arena.",
    yourName: "Your name",
    quickPlay: "Quick play",
    createRoom: "Create room",
    joinRoom: "Join room",
    roomCode: "Room code",
    enter: "Enter",
    roomNotFound: "Room not found or full",
    back: "Back",
    leave: "Leave",
    visibility: "Visibility",
    public: "Public",
    private: "Private",
    type: "Type",
    standardMode: "Standard: 5 maps",
    customMode: "Custom",
    players: "Players",
    player: "Player",
    rounds: "Rounds",
    startingWeapon: "Starting weapon",
    customMaps: "Custom maps",
    play: "Play",
    publicRoom: "Public room",
    privateRoom: "Private room",
    freeSlots: "open slots",
    yourCat: "Your cat",
    chooseFighter: "Choose fighter",
    occupiedBy: "Taken by",
    selectedCat: "Your cat",
    free: "Free",
    mode: "Mode",
    maps: "Maps",
    alive: "Alive",
    weapon: "Weapon",
    round: "Round",
    winsRound: "wins the round",
    result: "Result",
    playAgain: "Play again",
    menu: "Menu",
    controlsTitle: "Controls",
    controlsMove: "Move",
    controlsJump: "Jump",
    controlsAttack: "Attack / use weapon",
    controlsThrow: "Throw special weapon",
    controlsMobile: "On mobile, use the on-screen touch buttons.",
  },
} as const;

export const CAT_NAMES: Record<Language, Record<CatId, string>> = {
  es: {
    orange: "Naranja",
    black: "Negro",
    brown: "Marron",
    persian: "Persa",
    calico: "Calico",
    gray: "Gris",
    siamese: "Siames",
    tuxedo: "Smoking",
    striped: "Rayado",
    white: "Blanco",
    blue: "Azul",
    gold: "Dorado",
  },
  en: {
    orange: "Orange",
    black: "Black",
    brown: "Brown",
    persian: "Persian",
    calico: "Calico",
    gray: "Gray",
    siamese: "Siamese",
    tuxedo: "Tuxedo",
    striped: "Striped",
    white: "White",
    blue: "Blue",
    gold: "Golden",
  },
};

export const WEAPON_NAMES: Record<Language, Record<WeaponId, string>> = {
  es: {
    scratch: "Aranazo",
    fishbat: "Pescado bate",
    pistol: "Pistola de agua",
    sardine: "Sardina arrojadiza",
    spray: "Spray anti-gatos",
    yarn: "Bola de hilo",
    bomb: "Lata explosiva",
    bell: "Cascabel bomba",
  },
  en: {
    scratch: "Scratch",
    fishbat: "Fish bat",
    pistol: "Water pistol",
    sardine: "Thrown sardine",
    spray: "Cat spray",
    yarn: "Yarn ball",
    bomb: "Explosive can",
    bell: "Bell bomb",
  },
};

export const MAP_NAMES: Record<Language, Record<string, string>> = {
  es: {
    "roof-run": "Azoteas de Coopverse",
    greenhouse: "Invernadero Picante",
    subway: "Metro Medianoche",
    arcade: "Arcade de Carton",
    bakery: "Panaderia del Caos",
    dojo: "Dojo de Rascadores",
    lab: "Laboratorio del Laser",
    harbor: "Puerto de Atunes",
  },
  en: {
    "roof-run": "Coopverse Rooftops",
    greenhouse: "Spicy Greenhouse",
    subway: "Midnight Subway",
    arcade: "Cardboard Arcade",
    bakery: "Chaos Bakery",
    dojo: "Scratcher Dojo",
    lab: "Laser Laboratory",
    harbor: "Tuna Harbor",
  },
};

export function normalizeLanguage(value: string | null): Language {
  return value === "en" || value === "es" ? value : DEFAULT_LANGUAGE;
}

export function getStoredLanguage(): Language {
  return normalizeLanguage(localStorage.getItem(LANGUAGE_KEY));
}

export function getText(language: Language, key: keyof typeof UI_TEXT.es): string {
  return UI_TEXT[language][key];
}

export function getCatName(language: Language, id: CatId): string {
  return CAT_NAMES[language][id];
}

export function getWeaponName(language: Language, id: WeaponId): string {
  return WEAPON_NAMES[language][id];
}

export function getMapName(language: Language, id: string): string {
  return MAP_NAMES[language][id] ?? id;
}

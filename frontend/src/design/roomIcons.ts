// Catalog of room types -> Tabler icon names (SVGs in /public/rooms/).
// Source mapping curated from Tabler outline set.

export type RoomIconCategory = "living" | "sleeping" | "bath" | "storage" | "outside" | "activity";

export type RoomPreset = {
  key: string;         // Tabler icon file (without .svg)
  ru: string;          // Russian label for the picker
  en: string;          // English label
  category: RoomIconCategory;
  defaultColor?: string;
};

export const ROOM_PRESETS: RoomPreset[] = [
  // Living
  { key: "sofa",                 ru: "Гостиная",         en: "Living room",   category: "living",  defaultColor: "#22E5FF" },
  { key: "armchair",             ru: "Зал отдыха",       en: "Den",           category: "living",  defaultColor: "#22E5FF" },
  { key: "chair-director",       ru: "Столовая",         en: "Dining room",   category: "living" },
  { key: "tools-kitchen-2",      ru: "Кухня",            en: "Kitchen",       category: "living",  defaultColor: "#FFB547" },
  { key: "fridge",               ru: "Холодная",         en: "Pantry",        category: "living" },
  { key: "books",                ru: "Библиотека",       en: "Library",       category: "living" },
  { key: "desk",                 ru: "Кабинет",          en: "Office",        category: "living",  defaultColor: "#9D7BFF" },
  { key: "door-enter",           ru: "Прихожая",         en: "Entrance",      category: "living" },
  { key: "door",                 ru: "Холл",             en: "Hallway",       category: "living" },
  { key: "stairs",               ru: "Лестница",         en: "Staircase",     category: "living" },

  // Sleeping
  { key: "bed",                  ru: "Спальня",          en: "Bedroom",       category: "sleeping", defaultColor: "#9D7BFF" },
  { key: "bed-flat",             ru: "Главная спальня",  en: "Master bedroom",category: "sleeping", defaultColor: "#9D7BFF" },
  { key: "baby-carriage",        ru: "Детская",          en: "Kids room",     category: "sleeping", defaultColor: "#FF6BD6" },
  { key: "moon",                 ru: "Гостевая",         en: "Guest room",    category: "sleeping" },

  // Bath / utility
  { key: "bath",                 ru: "Ванная",           en: "Bathroom",      category: "bath",     defaultColor: "#6BD3FF" },
  { key: "droplet",              ru: "Душевая",          en: "Shower",        category: "bath",     defaultColor: "#6BD3FF" },
  { key: "toilet-paper",         ru: "Туалет",           en: "Toilet",        category: "bath" },
  { key: "wash-machine",         ru: "Прачечная",        en: "Laundry",       category: "bath" },
  { key: "flame",                ru: "Сауна",            en: "Sauna",         category: "bath",     defaultColor: "#FF6B8A" },
  { key: "pool",                 ru: "Бассейн",          en: "Pool",          category: "bath",     defaultColor: "#22E5FF" },

  // Storage / Utility
  { key: "garage",               ru: "Гараж",            en: "Garage",        category: "storage" },
  { key: "stairs-down",          ru: "Подвал",           en: "Basement",      category: "storage" },
  { key: "stairs-up",            ru: "Чердак",           en: "Attic",         category: "storage" },
  { key: "building-warehouse",   ru: "Кладовая",         en: "Storage",       category: "storage" },
  { key: "building-cottage",     ru: "Гардероб",         en: "Wardrobe",      category: "storage" },
  { key: "tool",                 ru: "Котельная",        en: "Boiler room",   category: "storage" },
  { key: "server",               ru: "Серверная",        en: "Server room",   category: "storage",  defaultColor: "#56F1A6" },
  { key: "router",               ru: "Сетевая",          en: "Network",       category: "storage" },

  // Outside
  { key: "umbrella",             ru: "Балкон",           en: "Balcony",       category: "outside" },
  { key: "picnic-table",         ru: "Терраса",          en: "Terrace",       category: "outside" },
  { key: "plant-2",              ru: "Сад",              en: "Garden",        category: "outside",  defaultColor: "#56F1A6" },
  { key: "tree",                 ru: "Двор",             en: "Yard",          category: "outside",  defaultColor: "#56F1A6" },
  { key: "plant",                ru: "Теплица",          en: "Greenhouse",    category: "outside",  defaultColor: "#56F1A6" },
  { key: "tools",                ru: "Мастерская",       en: "Workshop",      category: "outside" },
  { key: "parking",              ru: "Парковка",         en: "Driveway",      category: "outside" },
  { key: "fence",                ru: "Забор",            en: "Fence",         category: "outside" },
  { key: "car",                  ru: "Авто",             en: "Car",           category: "outside" },

  // Activity
  { key: "barbell",              ru: "Тренажёрный зал",  en: "Home gym",      category: "activity", defaultColor: "#FFB547" },
  { key: "treadmill",            ru: "Беговая",          en: "Cardio",        category: "activity" },
  { key: "device-gamepad-2",     ru: "Игровая",          en: "Game room",     category: "activity", defaultColor: "#FF6BD6" },
  { key: "movie",                ru: "Кинозал",          en: "Cinema",        category: "activity", defaultColor: "#9D7BFF" },
  { key: "piano",                ru: "Музыкальная",      en: "Music room",    category: "activity" },
  { key: "vinyl",                ru: "Студия",           en: "Studio",        category: "activity" },
  { key: "palette",              ru: "Мастерская",       en: "Art room",      category: "activity" },
  { key: "ball-basketball",      ru: "Спортзал",         en: "Sports",        category: "activity" },

  // Generic
  { key: "home",                 ru: "Дом",              en: "Home",          category: "living" },
  { key: "home-2",               ru: "Помещение",        en: "Room",          category: "living" },
  { key: "building-skyscraper",  ru: "Здание",           en: "Building",      category: "living" },
];

export const CATEGORY_LABEL_RU: Record<RoomIconCategory, string> = {
  living: "Жилые",
  sleeping: "Спальные",
  bath: "Сантехника",
  storage: "Хранение",
  outside: "Снаружи",
  activity: "Активность",
};

export function getPresetByKey(key: string): RoomPreset | undefined {
  return ROOM_PRESETS.find(p => p.key === key);
}

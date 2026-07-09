export const ZONES = ["northern", "eastern", "western"] as const;
export type Zone = (typeof ZONES)[number];

export const ZONE_LABELS: Record<Zone, string> = {
  northern: "Northern Zone",
  eastern: "Eastern Zone",
  western: "Western Zone",
};

export const NATIONAL_POSITION_DEFAULTS = [
  "National President",
  "National General Secretary",
  "National Financial Secretary",
  "National Missions Secretary",
  "National Academic Secretary",
  "National Prayer Secretary",
  "National Editor-in-Chief",
];

export const ZONAL_POSITION_DEFAULTS: Record<Zone, string> = {
  northern: "Northern Zonal Coordinator",
  eastern: "Eastern Zonal Coordinator",
  western: "Western Zonal Coordinator",
};

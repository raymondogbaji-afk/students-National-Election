export const ZONES = ["eastern", "northern", "western"] as const;
export type Zone = (typeof ZONES)[number];

export const ZONE_LABELS: Record<Zone, string> = {
  northern: "Northern Zone",
  eastern: "Eastern Zone",
  western: "Western Zone",
};

export const NATIONAL_POSITION_DEFAULTS = [
  "National Academic Secretary",
  "National Editor-in-chief",
  "National Missions Secretary",
  "National Prayer Secretary",
  "National President",
];

export const ZONAL_POSITION_DEFAULTS: Record<Zone, string> = {
  northern: "Northern Zonal Coordinator",
  eastern: "Eastern Zonal Coordinator",
  western: "Western Zonal Coordinator",
};

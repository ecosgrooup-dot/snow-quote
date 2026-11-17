// Site settings. Change values here; no other file needs editing.
window.SNOW_CONFIG = {
  // Mapbox public token (starts with "pk."). Empty = use the free fallback map and address search.
  mapboxToken: "",
  // Where quote requests are emailed (through formsubmit.co).
  email: "ecosgrooup@gmail.com",
  phone: "(612) 564-5857",
  // Map start: Minneapolis.
  start: { lat: 44.9778, lng: -93.265, zoom: 11 },
  sidewalkFt: 6,
  // Seasonal pricing tiers by cleared area (sq ft).
  pricing: {
    home: [
      { max: 1200, plan: "Home", season: 700, month: 117, visit: 85 },
      { max: 2500, plan: "Home, corner lot", season: 1250, month: 210, visit: 125 },
      { max: 5000, plan: "Large home", season: 1800, month: 300, visit: 165 }
    ],
    business: [
      { max: 1500, plan: "Entrance + sidewalks", season: 1500, month: 250, visit: 125 },
      { max: 6000, plan: "Entrance + sidewalks + small lot", season: 3200, month: 535, visit: 250 },
      { max: 12000, plan: "Large lot", season: 5000, month: 835, visit: 400 }
    ]
  },
  // 5% off when the whole season is paid up front; 10% for seniors and neighbors with a disability.
  prepayDiscount: 0.05,
  helpDiscount: 0.10,
  saltPerApplication: 45
};

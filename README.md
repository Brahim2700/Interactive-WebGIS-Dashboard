# CC Finder France

CC Finder France determines the recommended RGF93 / Lambert CC9 zone from a point's latitude. It supports French address search, decimal or DMS coordinates, and map selection. It is a static, framework-free website; Leaflet and OpenStreetMap provide the map, and the IGN Géoplateforme national geocoder provides address lookup.

## Project structure

```text
.
├── index.html
├── css/
│   └── main.css
├── js/
│   ├── crs.js
│   └── main.js
├── tests/
│   └── crs.test.js
├── package.json
└── README.md
```

## Run locally

Serve this directory over HTTP so browser modules and geocoding requests work. For example, with Python installed:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`. The app uses public external services and needs an internet connection to load the map and search addresses.

## Tests

Node.js 18 or later is recommended. Run:

```powershell
npm test
```

## Method and limitations

For latitudes from 41.5° to 50.5° N, the tool recommends the nearest integer latitude as the CC zone, with EPSG code `3900 + zone` (3942–3950). Latitude outside that interval is reported as outside nominal CC9 coverage. Points are checked against the requested metropolitan France coordinate bounds before a result is produced.

The displayed linear distortion is the requested simplified educational estimate `3.1 × (latitude − parallel of origin)²` cm/km. It is not a substitute for projection scale-factor calculations. The standard parallels are 0.75° either side of the origin; true Lambert scale distortion is zero there, a behavior this simplified estimate does not model. Use official IGN algorithms for contractual, cadastral, or high-precision work.

Address search uses the public IGN Géoplateforme geocoding endpoint (`data.geopf.fr`). Map tiles are © OpenStreetMap contributors.

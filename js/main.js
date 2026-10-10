const mapMessage = document.getElementById("map-message");
const coordinates = document.getElementById("coordinates");
const cartesianCoordinates = document.getElementById("cartesian-coordinates");
const projectionDetails = document.getElementById("projection-details");
const locationStatus = document.getElementById("location-status");
const zoomLevel = document.getElementById("zoom-level");
const locateButton = document.getElementById("locate-button");

function showMessage(message) {
	mapMessage.textContent = message;
	mapMessage.hidden = false;
}

if (typeof L === "undefined") {
	coordinates.textContent = "Map library unavailable";
	showMessage("The map could not load. Check your internet connection and refresh the page.");
} else {
	const map = L.map("map", {
		minZoom: 2,
		worldCopyJump: true,
		zoomControl: true
	}).setView([20, 0], 2);

	L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
		maxZoom: 19,
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
	}).addTo(map);

	L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

	function updateReadout() {
		zoomLevel.textContent = map.getZoom();
	}

	map.on("moveend zoomend", updateReadout);
	updateReadout();

	let locationMarker;
	let locationRequest = 0;

	async function findCommune(latitude, longitude) {
		const communeUrl = new URL("https://geo.api.gouv.fr/communes");
		communeUrl.search = new URLSearchParams({
			lat: latitude,
			lon: longitude,
			fields: "codeDepartement",
			format: "json"
		});

		const communeResponse = await fetch(communeUrl);
		if (!communeResponse.ok) {
			throw new Error("Commune lookup failed");
		}

		const communes = await communeResponse.json();
		return communes[0] || null;
	}

	async function updateProjection(latitude, longitude, requestId) {
		locationStatus.textContent = "Checking CC9 coverage...";
		projectionDetails.textContent = "Checking mainland France";
		cartesianCoordinates.textContent = "Calculating...";

		try {
			const commune = await findCommune(latitude, longitude);
			if (requestId !== locationRequest) return;

			if (!commune || !/^(?:0[1-9]|[1-8]\d|9[0-5]|2[AB])$/.test(commune.codeDepartement || "")) {
				locationStatus.textContent = "Outside CC9 coverage";
				projectionDetails.textContent = "CC42–CC50 cover mainland France";
				cartesianCoordinates.textContent = "Not available for this location";
				return;
			}

			if (typeof proj4 === "undefined") {
				throw new Error("Projection library unavailable");
			}

			const zone = Math.min(50, Math.max(42, Math.round(latitude)));
			const epsg = 3942 + zone - 42;
			const falseNorthing = 1200000 + (zone - 42) * 1000000;
			const definition = `+proj=lcc +lat_0=${zone} +lon_0=3 +lat_1=${zone - 0.75} +lat_2=${zone + 0.75} +x_0=1700000 +y_0=${falseNorthing} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
			proj4.defs(`EPSG:${epsg}`, definition);
			const [x, y] = proj4("EPSG:4326", `EPSG:${epsg}`, [longitude, latitude]);

			locationStatus.textContent = "Position found";
			projectionDetails.textContent = `CC${zone} · EPSG:${epsg}`;
			cartesianCoordinates.textContent = `X ${Math.round(x).toLocaleString("fr-FR")} m · Y ${Math.round(y).toLocaleString("fr-FR")} m`;
		} catch {
			if (requestId !== locationRequest) return;
			locationStatus.textContent = "Position found";
			projectionDetails.textContent = "Projection unavailable";
			cartesianCoordinates.textContent = "Check your connection and retry";
		}
	}

	locateButton.addEventListener("click", () => {
		if (!navigator.geolocation) {
			showMessage("Location is not available in this browser.");
			return;
		}

		const requestId = ++locationRequest;
		locateButton.disabled = true;
		locationStatus.textContent = "Requesting location...";
		projectionDetails.textContent = "Waiting for position";
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				const { latitude, longitude } = coords;
				const position = [latitude, longitude];
				map.setView(position, 13);
				coordinates.textContent = `${latitude.toFixed(6)}°, ${longitude.toFixed(6)}°`;
				cartesianCoordinates.textContent = "Checking position...";

				if (locationMarker) {
					locationMarker.setLatLng(position);
				} else {
					locationMarker = L.circleMarker(position, {
						radius: 7,
						color: "#ffffff",
						weight: 3,
						fillColor: "#286b50",
						fillOpacity: 1
					}).addTo(map);
				}

				locationMarker.bindPopup("You are here").openPopup();
				locateButton.disabled = false;
				mapMessage.hidden = true;
				updateProjection(latitude, longitude, requestId);
			},
			(error) => {
				if (requestId !== locationRequest) return;
				locateButton.disabled = false;
				locationStatus.textContent = "Location unavailable";
				const message = error.code === error.PERMISSION_DENIED
					? "Location permission was denied. Allow location access in your browser settings."
					: "Could not determine your location. Check your browser permission and try again.";
				showMessage(message);
			},
			{ enableHighAccuracy: true, timeout: 10000 }
		);
	});
}

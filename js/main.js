const mapMessage = document.getElementById("map-message");
const coordinates = document.getElementById("coordinates");
const cartesianCoordinates = document.getElementById("cartesian-coordinates");
const epciDetails = document.getElementById("epci-details");
const locationStatus = document.getElementById("location-status");
const zoomLevel = document.getElementById("zoom-level");
const locateButton = document.getElementById("locate-button");

const lambert93 = "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +units=m +no_defs";

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

	async function findEpci(latitude, longitude) {
		const communeUrl = new URL("https://geo.api.gouv.fr/communes");
		communeUrl.search = new URLSearchParams({
			lat: latitude,
			lon: longitude,
			fields: "nom,code,codeDepartement,codeEpci",
			format: "json"
		});

		const communeResponse = await fetch(communeUrl);
		if (!communeResponse.ok) {
			throw new Error("Commune lookup failed");
		}

		const communes = await communeResponse.json();
		const commune = communes[0];
		if (!commune?.codeEpci) {
			return { commune, epci: null };
		}

		const epciUrl = new URL(`https://geo.api.gouv.fr/epcis/${encodeURIComponent(commune.codeEpci)}`);
		epciUrl.search = new URLSearchParams({ fields: "nom,code", format: "json" });
		const epciResponse = await fetch(epciUrl);
		if (!epciResponse.ok) {
			throw new Error("EPCI lookup failed");
		}

		return { commune, epci: await epciResponse.json() };
	}

	async function updateEpci(latitude, longitude, requestId) {
		locationStatus.textContent = "Looking up EPCI...";
		epciDetails.textContent = "Querying official French data";

		try {
			const { commune, epci } = await findEpci(latitude, longitude);
			if (requestId !== locationRequest) return;

			if (!commune) {
				locationStatus.textContent = "Outside France or no match";
				cartesianCoordinates.textContent = "Lambert-93 applies to mainland France";
				epciDetails.textContent = "No French commune found";
				return;
			}

			const isMetropolitanDepartment = /^(?:0[1-9]|[1-8]\d|9[0-5]|2[AB])$/.test(commune.codeDepartement);
			if (!isMetropolitanDepartment) {
				cartesianCoordinates.textContent = "Lambert-93 applies to mainland France";
			} else if (typeof proj4 !== "undefined") {
				proj4.defs("EPSG:2154", lambert93);
				const [x, y] = proj4("EPSG:4326", "EPSG:2154", [longitude, latitude]);
				cartesianCoordinates.textContent = `X ${Math.round(x).toLocaleString("fr-FR")} m · Y ${Math.round(y).toLocaleString("fr-FR")} m`;
			} else {
				cartesianCoordinates.textContent = "Projection library unavailable";
			}

			if (!epci) {
				locationStatus.textContent = "Position found";
				epciDetails.textContent = `${commune.nom} · no EPCI listed`;
				return;
			}

			locationStatus.textContent = "Position found";
			epciDetails.textContent = `${epci.nom} · ${epci.code} (SIREN)`;
		} catch {
			if (requestId !== locationRequest) return;
			locationStatus.textContent = "Position found";
			epciDetails.textContent = "EPCI lookup unavailable; check your connection";
			cartesianCoordinates.textContent = "Could not verify Lambert-93 coverage";
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
		epciDetails.textContent = "Waiting for position";
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
				updateEpci(latitude, longitude, requestId);
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

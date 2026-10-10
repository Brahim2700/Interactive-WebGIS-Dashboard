const mapMessage = document.getElementById("map-message");
const coordinates = document.getElementById("coordinates");
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
		const center = map.getCenter();
		coordinates.textContent = `${center.lat.toFixed(2)}°, ${center.lng.toFixed(2)}°`;
		zoomLevel.textContent = map.getZoom();
	}

	map.on("moveend zoomend", updateReadout);
	updateReadout();

	let locationMarker;

	locateButton.addEventListener("click", () => {
		if (!navigator.geolocation) {
			showMessage("Location is not available in this browser.");
			return;
		}

		locateButton.disabled = true;
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				const position = [coords.latitude, coords.longitude];
				map.setView(position, 13);

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
			},
			() => {
				locateButton.disabled = false;
				showMessage("Could not determine your location. Check your browser permission.");
			},
			{ enableHighAccuracy: true, timeout: 10000 }
		);
	});
}

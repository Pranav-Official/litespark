export async function fileToBase64(file: File | Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

export async function processImage(
	file: File | Blob,
	maxWidthOrHeight = 1024,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();

		img.onload = () => {
			URL.revokeObjectURL(url);
			const canvas = document.createElement("canvas");
			let width = img.width;
			let height = img.height;

			if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
				if (width > height) {
					height = Math.round((height * maxWidthOrHeight) / width);
					width = maxWidthOrHeight;
				} else {
					width = Math.round((width * maxWidthOrHeight) / height);
					height = maxWidthOrHeight;
				}
			}

			canvas.width = width;
			canvas.height = height;

			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("Could not get canvas context"));
				return;
			}

			// Draw image with a white background (in case of transparent PNGs)
			ctx.fillStyle = "#FFFFFF";
			ctx.fillRect(0, 0, width, height);
			ctx.drawImage(img, 0, 0, width, height);

			const base64 = canvas.toDataURL("image/jpeg", 0.85); // High compression JPEG
			resolve(base64);
		};

		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("Failed to load image"));
		};

		img.src = url;
	});
}

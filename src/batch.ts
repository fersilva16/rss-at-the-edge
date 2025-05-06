export const batch = <T>(array: T[], size: number): T[][] => {
	return array.reduce((acc, item, index) => {
		const batchIndex = Math.floor(index / size);
		acc[batchIndex] = [...(acc[batchIndex] || []), item];
		return acc;
	}, [] as T[][]);
};

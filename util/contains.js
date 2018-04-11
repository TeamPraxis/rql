function contains (array, item) {
	for (let i = 0, l = array.length; i < l; i++) {
		if (array[i] === item) {
			return true;
		}
	}
}

module.exports = contains;

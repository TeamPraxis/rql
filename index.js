const { Query } = require('./query');
const { parseQuery } = require('./parser');
const { executeQuery } = require('./js-array');

module.exports = {
	Query,
	parseQuery,
	executeQuery
};

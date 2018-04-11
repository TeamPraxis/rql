const { Query } = require('../query');
const { parseQuery } = require('../parser');

const hasKeys = it => {
  if (it == null || typeof it !== 'object') {
    return false;
  }

  return Object.keys(it).length > 0;
};

const supportsDateString = !isNaN(new Date('2009')),
  queryPairs = {
    arrays: {
      a: { name: 'and', args: ['a'] },
      '(a)': { name: 'and', args: [['a']] },
      'a,b,c': { name: 'and', args: ['a', 'b', 'c'] },
      '(a,b,c)': { name: 'and', args: [['a', 'b', 'c']] },
      'a(b)': { name: 'and', args: [{ name: 'a', args: ['b'] }] },
      'a(b,c)': { name: 'and', args: [{ name: 'a', args: ['b', 'c'] }] },
      'a((b),c)': { name: 'and', args: [{ name: 'a', args: [['b'], 'c'] }] },
      'a((b,c),d)': {
        name: 'and',
        args: [{ name: 'a', args: [['b', 'c'], 'd'] }]
      },
      'a(b/c,d)': {
        name: 'and',
        args: [{ name: 'a', args: [['b', 'c'], 'd'] }]
      },
      'a(b)&c(d(e))': {
        name: 'and',
        args: [
          { name: 'a', args: ['b'] },
          { name: 'c', args: [{ name: 'd', args: ['e'] }] }
        ]
      }
    },
    'dot-comparison': {
      'foo.bar=3': {
        name: 'and',
        args: [{ name: 'eq', args: ['foo.bar', 3] }]
      },
      'select(sub.name)': {
        name: 'and',
        args: [{ name: 'select', args: ['sub.name'] }],
        cache: { select: ['sub.name'] }
      }
    },
    equality: {
      'eq(a,b)': { name: 'and', args: [{ name: 'eq', args: ['a', 'b'] }] },
      'a=eq=b': 'eq(a,b)',
      'a=b': 'eq(a,b)'
    },
    inequality: {
      'ne(a,b)': { name: 'and', args: [{ name: 'ne', args: ['a', 'b'] }] },
      'a=ne=b': 'ne(a,b)',
      'a!=b': 'ne(a,b)'
    },
    'less-than': {
      'lt(a,b)': { name: 'and', args: [{ name: 'lt', args: ['a', 'b'] }] },
      'a=lt=b': 'lt(a,b)',
      'a<b': 'lt(a,b)'
    },
    'less-than-equals': {
      'le(a,b)': { name: 'and', args: [{ name: 'le', args: ['a', 'b'] }] },
      'a=le=b': 'le(a,b)',
      'a<=b': 'le(a,b)'
    },
    'greater-than': {
      'gt(a,b)': { name: 'and', args: [{ name: 'gt', args: ['a', 'b'] }] },
      'a=gt=b': 'gt(a,b)',
      'a>b': 'gt(a,b)'
    },
    'greater-than-equals': {
      'ge(a,b)': { name: 'and', args: [{ name: 'ge', args: ['a', 'b'] }] },
      'a=ge=b': 'ge(a,b)',
      'a>=b': 'ge(a,b)'
    },
    'nested comparisons': {
      'a(b(le(c,d)))': {
        name: 'and',
        args: [
          {
            name: 'a',
            args: [{ name: 'b', args: [{ name: 'le', args: ['c', 'd'] }] }]
          }
        ]
      },
      'a(b(c=le=d))': 'a(b(le(c,d)))',
      'a(b(c<=d))': 'a(b(le(c,d)))'
    },
    'arbitrary FIQL desugaring': {
      'a=b=c': { name: 'and', args: [{ name: 'b', args: ['a', 'c'] }] },
      'a(b=cd=e)': {
        name: 'and',
        args: [{ name: 'a', args: [{ name: 'cd', args: ['b', 'e'] }] }]
      }
    },
    'and grouping': {
      'a&b&c': { name: 'and', args: ['a', 'b', 'c'] },
      'a(b)&c': { name: 'and', args: [{ name: 'a', args: ['b'] }, 'c'] },
      'a&(b&c)': { name: 'and', args: ['a', { name: 'and', args: ['b', 'c'] }] }
    },
    'or grouping': {
      '(a|b|c)': { name: 'and', args: [{ name: 'or', args: ['a', 'b', 'c'] }] },
      '(a(b)|c)': {
        name: 'and',
        args: [{ name: 'or', args: [{ name: 'a', args: ['b'] }, 'c'] }]
      }
    },
    'complex grouping': {
      'a&(b|c)': { name: 'and', args: ['a', { name: 'or', args: ['b', 'c'] }] },
      'a|(b&c)': { name: 'or', args: ['a', { name: 'and', args: ['b', 'c'] }] },
      'a(b(c<d,e(f=g)))': {
        name: 'and',
        args: [
          {
            name: 'a',
            args: [
              {
                name: 'b',
                args: [
                  { name: 'lt', args: ['c', 'd'] },
                  { name: 'e', args: [{ name: 'eq', args: ['f', 'g'] }] }
                ]
              }
            ]
          }
        ]
      }
    },
    'complex comparisons': {},
    'string coercion': {
      'a(string)': { name: 'and', args: [{ name: 'a', args: ['string'] }] },
      'a(string:b)': { name: 'and', args: [{ name: 'a', args: ['b'] }] },
      'a(string:1)': { name: 'and', args: [{ name: 'a', args: ['1'] }] }
    },
    'number coercion': {
      'a(number)': { name: 'and', args: [{ name: 'a', args: ['number'] }] },
      'a(number:1)': { name: 'and', args: [{ name: 'a', args: [1] }] }
      //'a(number:b)': { name: 'and', args: [{ name: 'a', args: [ NaN ]}]} // supposed to throw an error
    },
    'date coercion': {
      //FIXME do we need proper ISO date subset parsing?
      'a(date)': { name: 'and', args: [{ name: 'a', args: ['date'] }] },
      'a(date:2009)': supportsDateString && {
        name: 'and',
        args: [{ name: 'a', args: [new Date('2009')] }]
      },
      'a(date:1989-11-21)': supportsDateString && {
        name: 'and',
        args: [{ name: 'a', args: [new Date('1989-11-21')] }]
      },
      'a(date:1989-11-21T00:21:00.21Z)': {
        name: 'and',
        args: [
          { name: 'a', args: [new Date(Date.UTC(1989, 10, 21, 0, 21, 0, 21))] }
        ]
      },
      'a(date:1989-11-21T00:21:00Z)': {
        name: 'and',
        args: [
          { name: 'a', args: [new Date(Date.UTC(1989, 10, 21, 0, 21, 0))] }
        ]
      }
      //'a(date:b)': { name: 'and', args: [{ name: 'a', args: [ new Date(NaN) ]}]} // XXX?// supposed to throw an error
    },
    'boolean coercion': {
      'a(true)': { name: 'and', args: [{ name: 'a', args: [true] }] },
      'a(false)': { name: 'and', args: [{ name: 'a', args: [false] }] },
      'a(boolean:true)': { name: 'and', args: [{ name: 'a', args: [true] }] }
    },
    'null coercion': {
      'a(null)': { name: 'and', args: [{ name: 'a', args: [null] }] },
      'a(auto:null)': { name: 'and', args: [{ name: 'a', args: [null] }] },
      'a(string:null)': { name: 'and', args: [{ name: 'a', args: ['null'] }] }
    },
    'complex coercion': {
      '(a=b|c=d)&(e=f|g=1)': {
        name: 'and',
        args: [
          {
            name: 'or',
            args: [
              { name: 'eq', args: ['a', 'b'] },
              { name: 'eq', args: ['c', 'd'] }
            ]
          },
          {
            name: 'or',
            args: [
              { name: 'eq', args: ['e', 'f'] },
              { name: 'eq', args: ['g', 1] }
            ]
          }
        ]
      }
    }
  };

test('parsing', () => {
  for (const group in queryPairs) {
    const pairs = queryPairs[group];
    for (const key in pairs) {
      let expected = pairs[key];

      // skip tests which don't have an expected value
      if (!expected) {
        continue;
      }

      const actual = parseQuery(key);

      if (!hasKeys(actual.cache)) {
        delete actual.cache;
      }

      if (typeof expected === 'string') {
        expected = parseQuery(expected);
      }

      if (!hasKeys(expected.cache)) {
        delete expected.cache;
      }

      expect(actual).toEqual(expected);
    }
  }
});

test('behavior', () => {
  //assert.error(parseQuery(), "parseQuery requires a string");
  expect(parseQuery('')).toBeInstanceOf(Query);
  expect(parseQuery('a=b')).toBeInstanceOf(Query);
  //assert.error(parseQuery('?a=b'), 'cannot begin with a ?');
});

test('bind parameters', () => {
  // TODO
  let parsed;
  parsed = parseQuery('in(id,$1)', [['a', 'b', 'c']]);
  expect(parsed).toEqual({
    name: 'and',
    args: [{ name: 'in', args: ['id', ['a', 'b', 'c']] }],
    cache: {}
  });
  parsed = parseQuery('eq(id,$1)', ['a']);
  expect(parsed).toEqual({
    name: 'and',
    args: [{ name: 'eq', args: ['id', 'a'] }],
    cache: { id: 'a' }
  });
});

test('stringification', () => {
  // TODO
  let parsed;
  parsed = parseQuery('eq(id1,RE:%5Eabc%5C%2F)');
  // Hmmm. deepEqual gives null for regexps?
  expect(parsed.args[0].args[1].toString()).toBe(/^abc\//.toString());
  //assert.deepEqual(parsed, {name: 'and', args: [{name: 'eq', args: ['id1', /^abc\//]}]});
  expect(new Query().eq('_1', /GGG(EE|FF)/i) + '').toBe(
    'eq(_1,re:GGG%28EE%7CFF%29)'
  );
  parsed = parseQuery('eq(_1,re:GGG%28EE%7CFF%29)');
  expect(parsed.args[0].args[1].toString()).toBe(/GGG(EE|FF)/i.toString());
  //assert.ok(Query().eq('_1',/GGG(EE|FF)/)+'' === 'eq(_1,RE:GGG%28EE%7CFF%29)');
  // string to array and back
  const str = 'somefunc(and(1),(a,b),(10,(10,1)),(a,b.c))';
  expect(parseQuery(str) + '').toBe(str);
  // quirky arguments
  const name = ['a/b', 'c.d'];
  expect(parseQuery(new Query().eq(name, 1) + '') + '').toBe(
    'eq((a%2Fb,c.d),1)'
  );
  expect(parseQuery(new Query().eq(name, 1) + '').args[0].args[0]).toEqual(
    name
  );
});

test('matches', () => {
  const query = new Query().match('name', /Will*/);
  expect('' + query).toBe('match(name,RE:Will*)');
});

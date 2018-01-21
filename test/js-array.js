const { Query } = require('../query');
const { executeQuery } = require('../js-array');

const data = [
  {
    'with/slash': 'slashed',
    nested: {
      property: 'value'
    },
    price: 10,
    name: 'ten',
    tags: ['fun', 'even']
  },
  {
    price: 5,
    name: 'five',
    tags: ['fun']
  },
  {
    price: 15,
    name: 'five',
    tags: ['foo']
  }
];

test('filtering', () => {
  expect(executeQuery('price=lt=10', {}, data).length).toBe(1);
  expect(executeQuery('price=lt=11', {}, data).length).toBe(2);
  expect(executeQuery('nested/property=value', {}, data).length).toBe(1);
  expect(executeQuery('with%2Fslash=slashed', {}, data).length).toBe(1);
  expect(executeQuery('out(price,(5,10,15))', {}, data).length).toBe(0);
  expect(executeQuery('out(price,(5))', {}, data).length).toBe(2);
  expect(executeQuery('contains(tags,even)', {}, data).length).toBe(1);
  expect(executeQuery('contains(tags,fun)', {}, data).length).toBe(2);
  expect(executeQuery('excludes(tags,fun)', {}, data).length).toBe(1);
  expect(executeQuery('excludes(tags,ne(fun))', {}, data).length).toBe(1);
  expect(executeQuery('excludes(tags,ne(even))', {}, data).length).toBe(0);
  // eq() on re: should trigger .match()
  expect(executeQuery('price=match=10', {}, data)).toEqual([data[0]]);
  // ne() on re: should trigger .not(.match())
  expect(executeQuery('name=match=t.*', {}, data)).toEqual([data[0]]);
  expect(executeQuery('name=match=glob:t*', {}, data)).toEqual([data[0]]);
  expect(executeQuery(new Query().match('name', /t.*/), {}, data)).toEqual([
    data[0]
  ]);
});

test('filtering1', () => {
  const data = [{ 'path.1': [1, 2, 3] }, { 'path.1': [9, 3, 7] }];

  expect(executeQuery('contains(path,3)&sort()', {}, data)).toEqual([]); // path is undefined
  expect(executeQuery('contains(path.1,3)&sort()', {}, data)).toEqual(data); // 3 found in both
  expect(executeQuery('excludes(path.1,3)&sort()', {}, data)).toEqual([]); // 3 found in both
  expect(executeQuery('excludes(path.1,7)&sort()', {}, data)).toEqual([
    data[0]
  ]); // 7 found in second
});

test('sum', () => {
  expect(executeQuery('sum(price)', {}, data)).toBe(30);
});

test('aggregate', () => {
  expect(executeQuery('aggregate(name,sum(price))', {}, data)).toEqual([
    { 0: 10, name: 'ten' },
    { 0: 20, name: 'five' }
  ]);
});

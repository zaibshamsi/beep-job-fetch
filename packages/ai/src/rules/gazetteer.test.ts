import { describe, expect, it } from 'vitest';
import { findCities, findCityInQuery } from './gazetteer.ts';

describe('findCities', () => {
  const cases: Array<[string, string, string[]]> = [
    ['bangalore alias', 'Bangalore', ['Bengaluru']],
    ['bengaluru with state', 'Bengaluru, Karnataka, India', ['Bengaluru']],
    ['slash pair dedupes', 'Bengaluru/Bangalore', ['Bengaluru']],
    ['gurgaon alias', 'Gurgaon, Haryana', ['Gurugram']],
    ['delhi ncr only gives delhi', 'Delhi NCR', ['Delhi']],
    ['delhi/ncr slash form', 'Delhi/NCR', ['Delhi']],
    ['ncr plus named cities', 'Delhi NCR (Gurgaon, Noida)', ['Delhi', 'Gurugram', 'Noida']],
    ['multi city list keeps order', 'Pune | Mumbai | Hyderabad', ['Pune', 'Mumbai', 'Hyderabad']],
    ['navi mumbai beats mumbai', 'Navi Mumbai, Maharashtra', ['Mumbai']],
    ['greater noida', 'Greater Noida', ['Noida']],
    ['hitech city locality', 'Hitech City, Hyderabad', ['Hyderabad']],
    ['hinjewadi locality', 'Hinjewadi Phase 2', ['Pune']],
    ['pan india', 'Pan India', []],
    ['multiple locations', 'Multiple Locations', []],
    ['remote alone', 'Remote', []],
    ['empty', '', []],
    ['goa as a word', 'Goa', ['Panaji']],
    ['goa not inside goal', 'Hit your goal of growth', []],
    ['salem with state', 'Salem, Tamil Nadu', ['Salem']],
    ['salem standalone location', 'Salem', ['Salem']],
    ['salem oregon', 'Salem, OR, USA', []],
    ['salem in prose is not a city', 'We work with salem and partners', []],
    ['kota rajasthan', 'Kota, Rajasthan', ['Kota']],
    ['kota kinabalu', 'Kota Kinabalu, Malaysia', []],
    ['kota in prose', 'The kota system', []],
    ['uppercase code BLR', 'BLR / HYD', ['Bengaluru', 'Hyderabad']],
    ['lowercase blr in prose rejected', 'the hyd and blr teams', []],
    ['NCR the company', 'Experience with NCR Corporation terminals', []],
    ['salt lake city', 'Salt Lake City, Utah', []],
    ['salt lake kolkata', 'Salt Lake, Kolkata', ['Kolkata']],
    ['bank of baroda', 'Analyst at Bank of Baroda', []],
    ['baroda city', 'Baroda, Gujarat', ['Vadodara']],
    ['punctuation around names', '(Chennai); Coimbatore.', ['Chennai', 'Coimbatore']],
    ['unicode dash', 'Kochi – Kerala', ['Kochi']],
    ['trivandrum alias', 'Technopark, Trivandrum', ['Thiruvananthapuram']],
  ];
  it.each(cases)('%s', (_n, text, expected) => {
    expect(findCities(text)).toEqual(expected);
  });
});

describe('findCityInQuery', () => {
  const cases: Array<[string, string, string[]]> = [
    ['lowercase city', 'internships in pune', ['Pune']],
    ['two cities', 'software jobs bangalore or hyderabad', ['Bengaluru', 'Hyderabad']],
    ['lowercase code', 'jobs in blr', ['Bengaluru']],
    ['kota lowercase', 'data entry jobs in kota', ['Kota']],
    ['kota kinabalu rejected', 'jobs in kota kinabalu', []],
    ['no city', 'remote marketing internship', []],
    ['ncr expands', 'fresher jobs in delhi ncr', ['Delhi', 'Gurugram', 'Noida', 'Ghaziabad', 'Faridabad']],
    ['gurgaon plus ncr', 'gurgaon ncr', ['Gurugram', 'Delhi', 'Noida', 'Ghaziabad', 'Faridabad']],
  ];
  it.each(cases)('%s', (_n, text, expected) => {
    expect(findCityInQuery(text)).toEqual(expected);
  });
});

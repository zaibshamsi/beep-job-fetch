/**
 * City gazetteer for India: canonical name, state, centroid, and the aliases people actually write.
 * Used by the rule tagger, the NL search parser, and the map (lat/lng). Seeded into the `cities` table.
 * Tier: 1 = metro, 2 = large hub, 3 = other.
 */
export interface CityRecord {
  name: string;
  state: string;
  lat: number;
  lng: number;
  aliases: string[];
  tier: 1 | 2 | 3;
}

export const CITIES: CityRecord[] = [
  { name: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946, aliases: ['bangalore', 'bengaluru', 'blr', 'bangaluru', 'bengalooru'], tier: 1 },
  { name: 'Mumbai', state: 'Maharashtra', lat: 19.076, lng: 72.8777, aliases: ['bombay', 'mumbai', 'navi mumbai', 'thane', 'andheri', 'powai', 'bkc', 'vashi', 'airoli'], tier: 1 },
  { name: 'Delhi', state: 'Delhi', lat: 28.6139, lng: 77.209, aliases: ['new delhi', 'delhi', 'delhi ncr', 'ncr', 'south delhi', 'connaught place', 'nehru place', 'okhla'], tier: 1 },
  { name: 'Hyderabad', state: 'Telangana', lat: 17.385, lng: 78.4867, aliases: ['hyderabad', 'hyd', 'secunderabad', 'hitech city', 'hitec city', 'gachibowli', 'madhapur', 'kondapur'], tier: 1 },
  { name: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707, aliases: ['chennai', 'madras', 'sholinganallur', 'guindy', 'siruseri', 'taramani'], tier: 1 },
  { name: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639, aliases: ['kolkata', 'calcutta', 'salt lake', 'new town kolkata', 'howrah'], tier: 1 },
  { name: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567, aliases: ['pune', 'pimpri', 'pimpri chinchwad', 'hinjewadi', 'hinjawadi', 'kharadi', 'baner', 'magarpatta'], tier: 1 },
  { name: 'Gurugram', state: 'Haryana', lat: 28.4595, lng: 77.0266, aliases: ['gurgaon', 'gurugram', 'ggn', 'cyber city', 'cybercity'], tier: 1 },
  { name: 'Noida', state: 'Uttar Pradesh', lat: 28.5355, lng: 77.391, aliases: ['noida', 'greater noida', 'noida sector'], tier: 1 },
  { name: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714, aliases: ['ahmedabad', 'amdavad', 'sg highway'], tier: 2 },
  { name: 'Gandhinagar', state: 'Gujarat', lat: 23.2156, lng: 72.6369, aliases: ['gandhinagar', 'gift city'], tier: 3 },
  { name: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873, aliases: ['jaipur', 'pink city'], tier: 2 },
  { name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lng: 80.9462, aliases: ['lucknow'], tier: 2 },
  { name: 'Chandigarh', state: 'Chandigarh', lat: 30.7333, lng: 76.7794, aliases: ['chandigarh', 'mohali', 'panchkula', 'tricity', 'zirakpur'], tier: 2 },
  { name: 'Indore', state: 'Madhya Pradesh', lat: 22.7196, lng: 75.8577, aliases: ['indore'], tier: 2 },
  { name: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126, aliases: ['bhopal'], tier: 2 },
  { name: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673, aliases: ['kochi', 'cochin', 'ernakulam', 'kakkanad', 'infopark'], tier: 2 },
  { name: 'Thiruvananthapuram', state: 'Kerala', lat: 8.5241, lng: 76.9366, aliases: ['thiruvananthapuram', 'trivandrum', 'technopark'], tier: 2 },
  { name: 'Kozhikode', state: 'Kerala', lat: 11.2588, lng: 75.7804, aliases: ['kozhikode', 'calicut'], tier: 3 },
  { name: 'Coimbatore', state: 'Tamil Nadu', lat: 11.0168, lng: 76.9558, aliases: ['coimbatore', 'kovai'], tier: 2 },
  { name: 'Madurai', state: 'Tamil Nadu', lat: 9.9252, lng: 78.1198, aliases: ['madurai'], tier: 3 },
  { name: 'Tiruchirappalli', state: 'Tamil Nadu', lat: 10.7905, lng: 78.7047, aliases: ['tiruchirappalli', 'trichy', 'tiruchi'], tier: 3 },
  { name: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.6868, lng: 83.2185, aliases: ['visakhapatnam', 'vizag', 'vishakhapatnam'], tier: 2 },
  { name: 'Vijayawada', state: 'Andhra Pradesh', lat: 16.5062, lng: 80.648, aliases: ['vijayawada'], tier: 3 },
  { name: 'Guntur', state: 'Andhra Pradesh', lat: 16.3067, lng: 80.4365, aliases: ['guntur', 'mangalagiri', 'amaravati'], tier: 3 },
  { name: 'Tirupati', state: 'Andhra Pradesh', lat: 13.6288, lng: 79.4192, aliases: ['tirupati'], tier: 3 },
  { name: 'Mysuru', state: 'Karnataka', lat: 12.2958, lng: 76.6394, aliases: ['mysuru', 'mysore'], tier: 3 },
  { name: 'Mangaluru', state: 'Karnataka', lat: 12.9141, lng: 74.856, aliases: ['mangaluru', 'mangalore'], tier: 3 },
  { name: 'Hubballi', state: 'Karnataka', lat: 15.3647, lng: 75.124, aliases: ['hubballi', 'hubli', 'hubli dharwad', 'dharwad'], tier: 3 },
  { name: 'Belagavi', state: 'Karnataka', lat: 15.8497, lng: 74.4977, aliases: ['belagavi', 'belgaum'], tier: 3 },
  { name: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882, aliases: ['nagpur'], tier: 2 },
  { name: 'Nashik', state: 'Maharashtra', lat: 19.9975, lng: 73.7898, aliases: ['nashik', 'nasik'], tier: 3 },
  { name: 'Aurangabad', state: 'Maharashtra', lat: 19.8762, lng: 75.3433, aliases: ['aurangabad', 'chhatrapati sambhajinagar'], tier: 3 },
  { name: 'Kolhapur', state: 'Maharashtra', lat: 16.705, lng: 74.2433, aliases: ['kolhapur'], tier: 3 },
  { name: 'Surat', state: 'Gujarat', lat: 21.1702, lng: 72.8311, aliases: ['surat'], tier: 2 },
  { name: 'Vadodara', state: 'Gujarat', lat: 22.3072, lng: 73.1812, aliases: ['vadodara', 'baroda'], tier: 2 },
  { name: 'Rajkot', state: 'Gujarat', lat: 22.3039, lng: 70.8022, aliases: ['rajkot'], tier: 3 },
  { name: 'Bhubaneswar', state: 'Odisha', lat: 20.2961, lng: 85.8245, aliases: ['bhubaneswar', 'bhubaneshwar', 'odisha infocity'], tier: 2 },
  { name: 'Cuttack', state: 'Odisha', lat: 20.4625, lng: 85.883, aliases: ['cuttack'], tier: 3 },
  { name: 'Patna', state: 'Bihar', lat: 25.5941, lng: 85.1376, aliases: ['patna'], tier: 2 },
  { name: 'Ranchi', state: 'Jharkhand', lat: 23.3441, lng: 85.3096, aliases: ['ranchi'], tier: 3 },
  { name: 'Jamshedpur', state: 'Jharkhand', lat: 22.8046, lng: 86.2029, aliases: ['jamshedpur', 'tatanagar'], tier: 3 },
  { name: 'Raipur', state: 'Chhattisgarh', lat: 21.2514, lng: 81.6296, aliases: ['raipur', 'bhilai'], tier: 3 },
  { name: 'Guwahati', state: 'Assam', lat: 26.1445, lng: 91.7362, aliases: ['guwahati', 'gauhati'], tier: 3 },
  { name: 'Dehradun', state: 'Uttarakhand', lat: 30.3165, lng: 78.0322, aliases: ['dehradun', 'dehra dun'], tier: 3 },
  { name: 'Haridwar', state: 'Uttarakhand', lat: 29.9457, lng: 78.1642, aliases: ['haridwar', 'roorkee'], tier: 3 },
  { name: 'Shimla', state: 'Himachal Pradesh', lat: 31.1048, lng: 77.1734, aliases: ['shimla'], tier: 3 },
  { name: 'Jammu', state: 'Jammu and Kashmir', lat: 32.7266, lng: 74.857, aliases: ['jammu'], tier: 3 },
  { name: 'Srinagar', state: 'Jammu and Kashmir', lat: 34.0837, lng: 74.7973, aliases: ['srinagar'], tier: 3 },
  { name: 'Ludhiana', state: 'Punjab', lat: 30.901, lng: 75.8573, aliases: ['ludhiana'], tier: 3 },
  { name: 'Amritsar', state: 'Punjab', lat: 31.634, lng: 74.8723, aliases: ['amritsar'], tier: 3 },
  { name: 'Jalandhar', state: 'Punjab', lat: 31.326, lng: 75.5762, aliases: ['jalandhar'], tier: 3 },
  { name: 'Faridabad', state: 'Haryana', lat: 28.4089, lng: 77.3178, aliases: ['faridabad'], tier: 2 },
  { name: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.6692, lng: 77.4538, aliases: ['ghaziabad'], tier: 2 },
  { name: 'Kanpur', state: 'Uttar Pradesh', lat: 26.4499, lng: 80.3319, aliases: ['kanpur'], tier: 3 },
  { name: 'Varanasi', state: 'Uttar Pradesh', lat: 25.3176, lng: 82.9739, aliases: ['varanasi', 'banaras', 'benaras'], tier: 3 },
  { name: 'Agra', state: 'Uttar Pradesh', lat: 27.1767, lng: 78.0081, aliases: ['agra'], tier: 3 },
  { name: 'Prayagraj', state: 'Uttar Pradesh', lat: 25.4358, lng: 81.8463, aliases: ['prayagraj', 'allahabad'], tier: 3 },
  { name: 'Meerut', state: 'Uttar Pradesh', lat: 28.9845, lng: 77.7064, aliases: ['meerut'], tier: 3 },
  { name: 'Jodhpur', state: 'Rajasthan', lat: 26.2389, lng: 73.0243, aliases: ['jodhpur'], tier: 3 },
  { name: 'Udaipur', state: 'Rajasthan', lat: 24.5854, lng: 73.7125, aliases: ['udaipur'], tier: 3 },
  { name: 'Kota', state: 'Rajasthan', lat: 25.2138, lng: 75.8648, aliases: ['kota'], tier: 3 },
  { name: 'Gwalior', state: 'Madhya Pradesh', lat: 26.2183, lng: 78.1828, aliases: ['gwalior'], tier: 3 },
  { name: 'Jabalpur', state: 'Madhya Pradesh', lat: 23.1815, lng: 79.9864, aliases: ['jabalpur'], tier: 3 },
  { name: 'Siliguri', state: 'West Bengal', lat: 26.7271, lng: 88.3953, aliases: ['siliguri'], tier: 3 },
  { name: 'Durgapur', state: 'West Bengal', lat: 23.5204, lng: 87.3119, aliases: ['durgapur'], tier: 3 },
  { name: 'Puducherry', state: 'Puducherry', lat: 11.9416, lng: 79.8083, aliases: ['puducherry', 'pondicherry'], tier: 3 },
  { name: 'Panaji', state: 'Goa', lat: 15.4909, lng: 73.8278, aliases: ['panaji', 'goa', 'panjim', 'margao', 'vasco'], tier: 3 },
  { name: 'Imphal', state: 'Manipur', lat: 24.817, lng: 93.9368, aliases: ['imphal'], tier: 3 },
  { name: 'Shillong', state: 'Meghalaya', lat: 25.5788, lng: 91.8933, aliases: ['shillong'], tier: 3 },
  { name: 'Agartala', state: 'Tripura', lat: 23.8315, lng: 91.2868, aliases: ['agartala'], tier: 3 },
  { name: 'Gangtok', state: 'Sikkim', lat: 27.3314, lng: 88.6138, aliases: ['gangtok'], tier: 3 },
  { name: 'Port Blair', state: 'Andaman and Nicobar Islands', lat: 11.6234, lng: 92.7265, aliases: ['port blair'], tier: 3 },
  { name: 'Warangal', state: 'Telangana', lat: 17.9689, lng: 79.5941, aliases: ['warangal'], tier: 3 },
  { name: 'Salem', state: 'Tamil Nadu', lat: 11.6643, lng: 78.146, aliases: ['salem'], tier: 3 },
  { name: 'Vellore', state: 'Tamil Nadu', lat: 12.9165, lng: 79.1325, aliases: ['vellore'], tier: 3 },
];

/** Value used in job tags for work-from-anywhere posts. */
export const REMOTE = 'Remote';

/** Lower-case alias -> canonical name map. Includes the canonical names themselves. */
export function buildAliasIndex(): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of CITIES) {
    m.set(c.name.toLowerCase(), c.name);
    for (const a of c.aliases) m.set(a.toLowerCase(), c.name);
  }
  return m;
}

export const cityByName = new Map(CITIES.map((c) => [c.name, c] as const));

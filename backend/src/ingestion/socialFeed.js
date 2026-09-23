import { REGIONS, HOTSPOT_OFFSETS } from '../data/regions.js';
import { makeRng } from '../utils/rng.js';
import { intensityOf } from './state.js';

/**
 * Social-media / citizen-report feed (Objective 1, source c).
 * Uses the X (Twitter) API when X_BEARER_TOKEN is configured; otherwise simulates a believable
 * stream whose volume and distress ratio scale with each region's current rain intensity, so
 * NLP hotspot detection has something real to find during a "wet" tick.
 */
import { config } from '../config/index.js';

const rng = makeRng(555);

const DISTRESS = [
  'Help! Water entering our house near {p}, kids stuck upstairs #flood',
  'We are trapped on the roof at {p}, water still rising, please send a boat',
  'Need urgent rescue at {p}, elderly relative cannot move, water everywhere',
  'No drinking water for two days, stranded at {p}, please help us',
  'SOS {p} — family stuck in flood water, need rescue immediately',
  'bachao! paani ghar mein aa gaya {p} mein, madad chahiye',
  'Ambulance needed at {p}, road is submerged and someone is injured',
];
const HAZARD = [
  'River level rising fast near the {p} bridge',
  'Heavy rain since morning in {p}, roads waterlogging',
  'Waterlogging on the main road at {p}, traffic diverted',
  'NDRF team spotted near {p}, preparing for possible evacuation',
  'Drain overflow near {p}, avoid the area if you can',
];
const NEUTRAL = [
  'Weather is nice near {p} today',
  'Traffic normal on {p} road this evening',
  'Everyone at {p} is safe, thanks for checking in',
  'New tea stall opened near {p}, quite good',
  'Watching the match with friends near {p}',
];

const PLACES = ['Old Market', 'Station Road', 'Ganga Ghat', 'Civil Lines', 'Sector 9', 'Ram Nagar', 'Model Town', 'Bypass Road'];

function jitter(region, i) {
  const off = HOTSPOT_OFFSETS[i % HOTSPOT_OFFSETS.length];
  return { lat: region.lat + off.dLat + rng.normal(0, 0.004), lng: region.lng + off.dLng + rng.normal(0, 0.004) };
}

function simulatePostsForRegion(region) {
  const inten = intensityOf(region.id) ?? 0.2;
  const volume = rng.poisson(1 + inten * 6);
  const posts = [];
  for (let i = 0; i < volume; i += 1) {
    const roll = rng.next();
    const pool = roll < inten * 0.5 ? DISTRESS : roll < inten * 0.5 + 0.3 ? HAZARD : NEUTRAL;
    const template = rng.pick(pool);
    const place = `${rng.pick(PLACES)}, ${region.name}`;
    const geo = rng.next() < 0.6 ? jitter(region, i) : {};
    posts.push({
      externalId: `sim-${region.id}-${Date.now()}-${i}`,
      channel: rng.next() < 0.5 ? 'social' : 'citizen',
      author: `user_${rng.int(1000, 9999)}`,
      text: template.replace('{p}', place),
      ts: Date.now() - rng.int(0, 4 * 60 * 1000),
      ...geo,
    });
  }
  return posts;
}

async function fetchRealTweets(region) {
  const q = encodeURIComponent(`(flood OR rescue OR trapped OR help) "${region.name}" -is:retweet lang:en OR lang:hi`);
  const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?query=${q}&max_results=25&tweet.fields=created_at,geo`, {
    headers: { Authorization: `Bearer ${config.xBearer}` },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`X API ${res.status}`);
  const json = await res.json();
  return (json.data ?? []).map((t) => ({
    externalId: t.id,
    channel: 'social',
    author: 'x_user',
    text: t.text,
    ts: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
  }));
}

export async function fetchSocialAndCitizenPosts() {
  const out = [];
  for (const region of REGIONS) {
    try {
      const posts = config.xBearer ? await fetchRealTweets(region) : simulatePostsForRegion(region);
      out.push({ region, posts });
    } catch {
      out.push({ region, posts: simulatePostsForRegion(region) });
    }
  }
  return out;
}

export const usingLiveSocialApi = () => Boolean(config.xBearer);

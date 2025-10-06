// hybrid.js
require('dotenv').config();

const ExplicitRecommender = require('./explicit');
const ImplicitRecommender = require('./implicit');
const SpotifyWebApi = require("spotify-web-api-node");

function mergeProfiles(explicit, implicit, weights = { explicit: 0.7, implicit: 0.3 }) {
    // Build a map of genre → accumulated weighted stats
    const genreMap = new Map();
    ['explicit','implicit'].forEach(side => {
        const profile = side === 'explicit' ? explicit : implicit;
        const w       = weights[side];

        profile.genres.forEach(pref => {
            const { name, q1, medianYear, q3 } = pref;

            let entry = genreMap.get(name);
            if (!entry) {
                entry = { name, q1: 0, medianYear: 0, q3: 0, weightSum: 0 };
                genreMap.set(name, entry);
            }

            if (q1 != null)         entry.q1 += q1 * w;
            if (medianYear != null) entry.medianYear += medianYear * w;
            if (q3 != null)         entry.q3 += q3 * w;
            entry.weightSum += w;
        });
    });

    // Normalize back to per‐genre prefs
    const mergedGenres = Array.from(genreMap.values()).map(e => ({
        name:       e.name,
        q1:         e.q1         / e.weightSum,
        medianYear: e.medianYear / e.weightSum,
        q3:         e.q3         / e.weightSum
    }));

    // Union of artists
    const mergedArtists = Array.from(
        new Set([...explicit.artists, ...implicit.artists])
    );

    return { genres: mergedGenres, artists: mergedArtists };
}

class HybridRecommender {

    constructor(accessToken) {
        this.explicit = new ExplicitRecommender(accessToken);
        this.implicit = new ImplicitRecommender(accessToken);
        this.spotifyApi = new SpotifyWebApi({
            redirectUri: process.env.SPOTIFY_REDIRECT_URI,
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
            accessToken: accessToken
        })
    }

    async getRecommendations() {
        const explicitProfile = await this.explicit._createUserProfile();
        const implicitProfile = await this.implicit._createUserProfile();

        const userProfile = mergeProfiles(explicitProfile, implicitProfile);

        const popularCandidates = await this.explicit._getPopularTracks();

        return this.explicit._calculateRecommendations(userProfile, popularCandidates);
    }
}

module.exports = HybridRecommender;
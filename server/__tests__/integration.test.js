// Integration testy pre Express endpointy.
// Mockujeme MySQL aj Spotify API - testy nevyžadujú beh DB ani siete.

jest.mock('mysql2/promise', () => {
    const mockExecute = jest.fn().mockResolvedValue([[], []]);
    return {
        createPool: () => ({ execute: mockExecute }),
        __mockExecute: mockExecute,
    };
});

// Mock celého spotify-web-api-node modulu. Všetky `new SpotifyWebApi(...)`
// vrátia ten istý mockInstance, aby sme mohli per-test konfigurovať odpovede.
jest.mock('spotify-web-api-node', () => {
    const mockInstance = {
        setAccessToken: jest.fn(),
        authorizationCodeGrant: jest.fn(),
        refreshAccessToken: jest.fn(),
        getMe: jest.fn(),
        containsMySavedTracks: jest.fn(),
        addToMySavedTracks: jest.fn(),
        removeFromMySavedTracks: jest.fn(),
        play: jest.fn(),
        getTrack: jest.fn(),
        getArtist: jest.fn(),
    };
    const MockSpotifyApi = jest.fn(() => mockInstance);
    MockSpotifyApi.__mockInstance = mockInstance;
    return MockSpotifyApi;
});

// Aby sa pri /login nevolala inicializácia (čo robí veľa DB volaní)
jest.mock('../initialiseUserInDatabase', () => jest.fn().mockResolvedValue(undefined));

// Mock recommenderov, aby sa pri requestoch nepokúšali volať Spotify ani DB
jest.mock('../recommender/implicit', () =>
    jest.fn().mockImplementation(() => ({
        spotifyApi: { getMe: jest.fn().mockResolvedValue({ body: { email: 't@e.sk' } }) },
        getRecommendations: jest.fn().mockResolvedValue([]),
    }))
);
jest.mock('../recommender/explicit', () =>
    jest.fn().mockImplementation(() => ({
        spotifyApi: { getMe: jest.fn().mockResolvedValue({ body: { email: 't@e.sk' } }) },
        getRecommendations: jest.fn().mockResolvedValue([]),
    }))
);
jest.mock('../recommender/hybrid', () =>
    jest.fn().mockImplementation(() => ({
        spotifyApi: { getMe: jest.fn().mockResolvedValue({ body: { email: 't@e.sk' } }) },
        getRecommendations: jest.fn().mockResolvedValue([]),
    }))
);

const request = require('supertest');
const app = require('../server');
const mysql = require('mysql2/promise');
const SpotifyWebApi = require('spotify-web-api-node');
const mockDB = mysql.__mockExecute;
const mockSpotify = SpotifyWebApi.__mockInstance;

describe('GET /health', () => {
    test('1. vráti 200 a status "healthy"', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('healthy');
        expect(res.body.timestamp).toBeDefined();
    });
});

describe('POST /login - validácia vstupu', () => {
    test('2. bez Content-Type application/json → 400', async () => {
        const res = await request(app)
            .post('/login')
            .set('Content-Type', 'text/plain')
            .send('code=abc');
        expect(res.status).toBe(400);
    });

    test('3. bez "code" v tele → 400', async () => {
        const res = await request(app)
            .post('/login')
            .send({});
        expect(res.status).toBe(400);
    });
});

describe('POST /refresh - validácia vstupu', () => {
    test('4. bez refreshToken → 400 s chybovou správou', async () => {
        const res = await request(app)
            .post('/refresh')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/refresh token/i);
    });
});

describe('POST /recommendations - validácia vstupu', () => {
    test('5. bez accessToken → 401', async () => {
        const res = await request(app)
            .post('/recommendations')
            .send({});
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/access token/i);
    });
});

describe('POST /ratings - validácia vstupu', () => {
    test('6. bez povinných polí → 400', async () => {
        const res = await request(app)
            .post('/ratings')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/missing required/i);
    });

    test('7. rating mimo rozsahu 1–5 → 400', async () => {
        const res = await request(app)
            .post('/ratings')
            .send({
                track: { id: 'track1' },
                rating: 7,
                userEmail: 'user@example.com',
                accessToken: 'fake-token',
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/between 1 and 5/i);
    });
});

describe('POST /track-changed - validácia vstupu', () => {
    test('8. bez trackUri → 400', async () => {
        const res = await request(app)
            .post('/track-changed')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/missing trackUri/i);
    });

    test('9. nevalídny typ interakcie → 400 so zoznamom povolených hodnôt', async () => {
        const res = await request(app)
            .post('/track-changed')
            .send({
                trackUri: 'spotify:track:abc',
                interaction: 'INVALID_TYPE',
                accessToken: 'fake-token',
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/invalid interaction/i);
        expect(res.body.error).toContain('listen');
        expect(res.body.error).toContain('skip');
    });
});

describe('POST /add-to-library - validácia vstupu', () => {
    test('10. bez track.id → 400 (nepadne na TypeError)', async () => {
        const res = await request(app)
            .post('/add-to-library')
            .send({ accessToken: 'fake-token' }); // chýba track úplne
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/missing data/i);
    });
});

describe('Neznáme routes', () => {
    test('11. GET na neexistujúcu route → 404 s JSON odpoveďou', async () => {
        const res = await request(app).get('/this-does-not-exist');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Endpoint not found');
        expect(res.body.path).toBe('/this-does-not-exist');
    });
});


// ────────────────────────────────────────────────────────────────
// Happy path testy (2xx) - overujeme kontrakt API pri úspešných volaniach
// ────────────────────────────────────────────────────────────────

describe('Happy path - 2xx odpovede', () => {
    beforeEach(() => {
        // Reset všetkých Spotify mock metód pred každým testom
        Object.values(mockSpotify).forEach(fn => fn.mockReset && fn.mockReset());
        mockDB.mockReset();
        mockDB.mockResolvedValue([[], []]); // default: prázdny výsledok
    });

    test('12. POST /login → 200 s tokenmi (existujúci používateľ)', async () => {
        mockSpotify.authorizationCodeGrant.mockResolvedValue({
            body: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }
        });
        mockSpotify.getMe.mockResolvedValue({
            body: { email: 'user@example.com', display_name: 'User', country: 'SK' }
        });
        // DB: existujúci používateľ → initialiseUserInDatabase sa nezavolá
        mockDB.mockResolvedValueOnce([[{ email: 'user@example.com' }]]);

        const res = await request(app)
            .post('/login')
            .send({ code: 'valid-auth-code' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            accessToken: 'AT',
            refreshToken: 'RT',
            expiresIn: 3600,
        });
    });

    test('13. POST /refresh → 200 s novým accessTokenom', async () => {
        mockSpotify.refreshAccessToken.mockResolvedValue({
            body: { accessToken: 'NEW_AT', expiresIn: 3600 }
        });

        const res = await request(app)
            .post('/refresh')
            .send({ refreshToken: 'valid-refresh-token' });

        expect(res.status).toBe(200);
        expect(res.body.accessToken).toBe('NEW_AT');
        expect(res.body.expiresIn).toBe(3600);
    });

    test('14. POST /recommendations → 200 s tromi playlistami', async () => {
        // Recommenderi sú už mocknutí na úrovni súboru a vracajú []
        const res = await request(app)
            .post('/recommendations')
            .send({ accessToken: 'valid-token' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('implicit');
        expect(res.body).toHaveProperty('explicit');
        expect(res.body).toHaveProperty('hybrid');
    });

    test('15. POST /ratings → 200 s uloženým ratingom (insert)', async () => {
        // 1. SELECT user → existuje
        mockDB.mockResolvedValueOnce([[{ email: 'user@example.com' }]]);
        // 2. SELECT track v ensureTrackInDatabase → existuje (neinicializuje sa nič)
        mockDB.mockResolvedValueOnce([[{ track_id: 'track1' }]]);
        // 3. UPDATE ratings → 0 affected rows (track ešte nemá rating)
        mockDB.mockResolvedValueOnce([{ affectedRows: 0 }]);
        // 4. INSERT ratings → ok
        mockDB.mockResolvedValueOnce([{ insertId: 1 }]);

        const res = await request(app)
            .post('/ratings')
            .send({
                track: { id: 'track1', uri: 'spotify:track:track1', name: 'Song', artists: [], album: { name: 'A' } },
                rating: 5,
                userEmail: 'user@example.com',
                accessToken: 'valid-token',
            });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            track_id: 'track1',
            user_email: 'user@example.com',
            rating: 5,
        });
    });

    test('16. POST /play-recommendations → 200 a Spotify play() je zavolaná so správnymi URI', async () => {
        mockSpotify.play.mockResolvedValue({});

        const res = await request(app)
            .post('/play-recommendations')
            .send({
                accessToken: 'valid-token',
                recommendations: [
                    { track: { uri: 'spotify:track:a' } },
                    { track: { uri: 'spotify:track:b' } },
                ],
                deviceId: 'device-123',
            });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok' });
        expect(mockSpotify.play).toHaveBeenCalledWith({
            uris: ['spotify:track:a', 'spotify:track:b'],
            device_id: 'device-123',
        });
    });

    test('17. POST /add-to-library → 200 status:"added" keď track nie je v knižnici', async () => {
        mockSpotify.getMe.mockResolvedValue({
            body: { email: 'user@example.com' }
        });
        mockSpotify.containsMySavedTracks.mockResolvedValue({ body: [false] });
        mockSpotify.addToMySavedTracks.mockResolvedValue({});

        // 1. SELECT user → existuje
        mockDB.mockResolvedValueOnce([[{ email: 'user@example.com' }]]);
        // 2. SELECT track v ensureTrackInDatabase → existuje
        mockDB.mockResolvedValueOnce([[{ track_id: 'track1' }]]);
        // 3. INSERT interactions → ok
        mockDB.mockResolvedValueOnce([{ insertId: 1 }]);

        const res = await request(app)
            .post('/add-to-library')
            .send({
                accessToken: 'valid-token',
                track: { id: 'track1', uri: 'spotify:track:track1', name: 'Song', artists: [], album: { name: 'A' } },
            });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'added' });
        expect(mockSpotify.addToMySavedTracks).toHaveBeenCalledWith(['track1']);
    });
});

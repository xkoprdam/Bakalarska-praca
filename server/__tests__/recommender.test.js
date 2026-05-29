// Unit testy pre čisté funkcie recommendera.
// Tieto testy nevyžadujú MySQL ani Spotify API - testujú len výpočtovú logiku.

// Mockujeme mysql2/promise, aby sa pri importe recommendera nepokúšal pripojiť k DB
jest.mock('mysql2/promise', () => ({
    createPool: () => ({
        execute: jest.fn().mockResolvedValue([[], []]),
    }),
}));

const ExplicitRecommender = require('../recommender/explicit');
const ImplicitRecommender = require('../recommender/implicit');

describe('ExplicitRecommender._genreSimilarity', () => {
    const rec = new ExplicitRecommender('fake-token');

    test('vráti 1.0 keď sa všetky používateľove žánre zhodujú s trackom', () => {
        const userGenres = [{ name: 'pop' }, { name: 'rock' }];
        const trackGenres = ['pop', 'rock'];
        expect(rec._genreSimilarity(userGenres, trackGenres)).toBe(1);
    });

    test('vráti 0 keď sa žiadne žánre nezhodujú', () => {
        const userGenres = [{ name: 'pop' }, { name: 'rock' }];
        const trackGenres = ['jazz', 'classical'];
        expect(rec._genreSimilarity(userGenres, trackGenres)).toBe(0);
    });

    test('vráti 1 nezávisí na veľkosti písmen (rozdielne veľkosti písmen)', () => {
        const userGenres = [{ name: 'Pop' }, { name: 'ROCK' }];
        const trackGenres = ['pop', 'rock'];
        expect(rec._genreSimilarity(userGenres, trackGenres)).toBe(1);
    });

    test('4. funguje pri substring zhode (indie pop obsahuje pop)', () => {
        const userGenres = [{ name: 'pop' }];
        const trackGenres = ['indie pop'];
        expect(rec._genreSimilarity(userGenres, trackGenres)).toBe(1);
    });

    test('5. vráti 0 pre prázdne žánre tracku', () => {
        const userGenres = [{ name: 'pop' }, { name: 'rock' }];
        expect(rec._genreSimilarity(userGenres, [])).toBe(0);
    });
});

describe('ExplicitRecommender._normalizePopularity', () => {
    const rec = new ExplicitRecommender('fake-token');

    test('6. popularita 100 sa normalizuje na 1.0', () => {
        expect(rec._normalizePopularity(100)).toBe(1.0);
    });

    test('7. popularita 0 sa normalizuje na 0.0', () => {
        expect(rec._normalizePopularity(0)).toBe(0.0);
    });

    test('8. popularita 50 sa normalizuje na 0.5 (stredná hodnota)', () => {
        expect(rec._normalizePopularity(50)).toBe(0.5);
    });
});

describe('ImplicitRecommender._normalizeRecency', () => {
    const rec = new ImplicitRecommender('fake-token');

    test('9. dnešný release má vysoké recency skóre (blízke 1.0)', () => {
        const now = new Date('2025-01-01');
        const today = '2025-01-01';
        const score = rec._normalizeRecency(today, now);
        expect(score).toBeGreaterThan(0.99);
        expect(score).toBeLessThanOrEqual(1.0);
    });

    test('10. release starší ako 2 roky má recency 0 (decay)', () => {
        const now = new Date('2025-01-01');
        const oldRelease = '2020-01-01'; // 5 rokov dozadu
        const score = rec._normalizeRecency(oldRelease, now);
        expect(score).toBe(0);
    });
});

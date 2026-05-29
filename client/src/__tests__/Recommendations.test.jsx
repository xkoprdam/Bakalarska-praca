// Unit testy pre Recommendations komponent.
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Recommendations from '../Recommendations';

// Mock axios - aby sa nevolala reálna API (Spotify ani lokálny backend)
vi.mock('axios', () => ({
    default: {
        get: vi.fn().mockResolvedValue({ data: [] }),
        post: vi.fn().mockResolvedValue({ data: [], status: 200 }),
    },
}));

describe('Recommendations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('1. zobrazí prompt "Get Recommendations" keď nie sú žiadne odporúčania', () => {
        render(
            <Recommendations
                accessToken="fake-token"
                chooseTrack={() => {}}
                recommendations={[]}
                setRecommendations={() => {}}
                playList={() => {}}
            />
        );
        expect(screen.getByText(/Click below to generate your recommendations/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Get Recommendations/i })).toBeInTheDocument();
    });

    test('2. zobrazí 3 záložky pre playlisty (implicit/hybrid/explicit)', () => {
        const recommendations = {
            implicit: [{ track: { id: 't1', name: 'Track 1', duration_ms: 180000, artists: [{ name: 'Artist 1' }], album: { images: [{ url: 'a.jpg' }] } } }],
            hybrid: [],
            explicit: [],
        };
        render(
            <Recommendations
                accessToken="fake-token"
                chooseTrack={() => {}}
                recommendations={recommendations}
                setRecommendations={() => {}}
                playList={() => {}}
            />
        );
        expect(screen.getByText('Playlist 1')).toBeInTheDocument();
        expect(screen.getByText('Playlist 2')).toBeInTheDocument();
        expect(screen.getByText('Playlist 3')).toBeInTheDocument();
    });

    test('3. tlačidlo "Play All" zavolá playList s URI skladieb aktívnej záložky', async () => {
        const user = userEvent.setup();
        const playList = vi.fn();
        const recommendations = {
            implicit: [
                { track: { id: 't1', uri: 'spotify:track:t1', name: 'Track 1', duration_ms: 180000, artists: [{ name: 'A' }], album: { images: [{ url: 'a.jpg' }] } } },
                { track: { id: 't2', uri: 'spotify:track:t2', name: 'Track 2', duration_ms: 200000, artists: [{ name: 'B' }], album: { images: [{ url: 'b.jpg' }] } } },
            ],
            hybrid: [],
            explicit: [],
        };

        render(
            <Recommendations
                accessToken="fake-token"
                chooseTrack={() => {}}
                recommendations={recommendations}
                setRecommendations={() => {}}
                playList={playList}
            />
        );

        await user.click(screen.getByRole('button', { name: /Play All/i }));

        expect(playList).toHaveBeenCalledTimes(1);
        expect(playList).toHaveBeenCalledWith(['spotify:track:t1', 'spotify:track:t2']);
    });
});

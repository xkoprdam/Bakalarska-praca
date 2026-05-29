// Unit testy pre TrackSearchResults komponent.
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackSearchResults from '../TrackSearchResults';

// Mock axios - aby sa nevolala reálna Spotify API
vi.mock('axios', () => ({
    default: {
        get: vi.fn().mockResolvedValue({ data: [false] }),
        post: vi.fn().mockResolvedValue({ data: { status: 'added' } }),
    },
}));

const mockTrack = {
    id: 'track123',
    title: 'Imagine',
    artist: 'John Lennon',
    albumUrl: 'https://example.com/album.jpg',
};

describe('TrackSearchResults', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('1. zobrazí názov skladby a interpreta', () => {
        render(
            <TrackSearchResults
                track={mockTrack}
                chooseTrack={() => {}}
                accessToken="fake-token"
            />
        );
        expect(screen.getByText('Imagine')).toBeInTheDocument();
        expect(screen.getByText('John Lennon')).toBeInTheDocument();
    });

    test('2. zobrazí obrázok albumu so správnym src', () => {
        render(
            <TrackSearchResults
                track={mockTrack}
                chooseTrack={() => {}}
                accessToken="fake-token"
            />
        );
        const img = screen.getByRole('img', { name: /album art/i });
        expect(img).toHaveAttribute('src', 'https://example.com/album.jpg');
    });

    test('3. kliknutie na riadok zavolá chooseTrack so správnym track objektom', async () => {
        const user = userEvent.setup();
        const chooseTrack = vi.fn();

        render(
            <TrackSearchResults
                track={mockTrack}
                chooseTrack={chooseTrack}
                accessToken="fake-token"
            />
        );

        await user.click(screen.getByText('Imagine'));

        expect(chooseTrack).toHaveBeenCalledTimes(1);
        expect(chooseTrack).toHaveBeenCalledWith(mockTrack);
    });
});

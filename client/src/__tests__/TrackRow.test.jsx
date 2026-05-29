// Unit testy pre komponent TrackRow.
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackRow from '../TrackRow';

const mockTrack = {
    name: 'Bohemian Rhapsody',
    duration_ms: 354000, // 5:54
};

describe('TrackRow', () => {
    test('zobrazí názov skladby', () => {
        render(<TrackRow track={mockTrack} chooseTrack={() => {}} index={1} />);
        expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
    });

    test('zobrazí poradové číslo (index)', () => {
        render(<TrackRow track={mockTrack} chooseTrack={() => {}} index={7} />);
        expect(screen.getByText('7')).toBeInTheDocument();
    });

    test('správne formátuje dĺžku skladby ako mm:ss', () => {
        render(<TrackRow track={mockTrack} chooseTrack={() => {}} index={1} />);
        expect(screen.getByText('5:54')).toBeInTheDocument();
    });

    test('doplní chýbajúcu nulu pri sekundách (3:05 namiesto 3:5)', () => {
        const track = { name: 'Short Song', duration_ms: 185000 }; // 3:05
        render(<TrackRow track={track} chooseTrack={() => {}} index={1} />);
        expect(screen.getByText('3:05')).toBeInTheDocument();
    });

    test('zavolá chooseTrack pri kliknutí na riadok s pesničkou', async () => {
        const user = userEvent.setup();
        const chooseTrack = vi.fn();
        render(<TrackRow track={mockTrack} chooseTrack={chooseTrack} index={1} />);

        await user.click(screen.getByText('Bohemian Rhapsody'));

        expect(chooseTrack).toHaveBeenCalledTimes(1);
        expect(chooseTrack).toHaveBeenCalledWith(mockTrack);
    });
});

// Unit testy pre LoadingOverlay komponent.
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingOverlay from '../LoadingOverlay';

describe('LoadingOverlay', () => {
    test('1. zobrazí text "Fetching user data from Spotify..."', () => {
        render(<LoadingOverlay />);
        expect(screen.getByText(/Fetching user data from Spotify/i)).toBeInTheDocument();
    });

    test('2. renderuje sa bez chyby aj bez žiadnych props', () => {
        const { container } = render(<LoadingOverlay />);
        // Overíme že DOM nie je prázdny
        expect(container.firstChild).not.toBeNull();
    });
});

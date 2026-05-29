// Unit testy pre Login komponent.
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Login from '../Login';

describe('Login', () => {
    test('1. zobrazí tlačidlo "Login with Spotify"', () => {
        render(<Login />);
        expect(screen.getByText('Login with Spotify')).toBeInTheDocument();
    });

    test('2. link smeruje na Spotify OAuth autorizačný endpoint', () => {
        render(<Login />);
        const link = screen.getByRole('link', { name: /Login with Spotify/i });
        expect(link).toHaveAttribute('href');
        expect(link.getAttribute('href')).toContain('accounts.spotify.com/authorize');
    });

    test('3. autorizačný URL obsahuje client_id a response_type=code', () => {
        render(<Login />);
        const link = screen.getByRole('link', { name: /Login with Spotify/i });
        const href = link.getAttribute('href');
        expect(href).toContain('client_id=');
        expect(href).toContain('response_type=code');
    });
});

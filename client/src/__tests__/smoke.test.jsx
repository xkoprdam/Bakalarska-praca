import { render, screen } from '@testing-library/react';

test('vitest funguje', () => {
    render(<p>Hello</p>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
});
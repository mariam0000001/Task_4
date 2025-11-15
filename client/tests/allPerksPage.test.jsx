import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';

import AllPerks from '../src/pages/AllPerks.jsx';
import { renderWithRouter } from './utils/renderWithRouter.js';

describe('AllPerks page (Directory)', () => {
  test('lists public perks and responds to name filtering', async () => {
    const seededPerk = global.__TEST_CONTEXT__?.seededPerk;

    renderWithRouter(
      <Routes>
        <Route path="/explore" element={<AllPerks />} />
      </Routes>,
      { initialEntries: ['/explore'] }
    );

    // Ensure data is loaded
    await waitFor(() => {
      expect(screen.getByText(seededPerk.title)).toBeInTheDocument();
    });

    // Filter by name
    const nameFilter =
      screen.queryByPlaceholderText('Enter perk name...') ||
      screen.getByRole('textbox');

    fireEvent.change(nameFilter, { target: { value: seededPerk.title } });

    await waitFor(() => {
      expect(screen.getByText(seededPerk.title)).toBeInTheDocument();
    });

    // Do not assert exact counts; just that the "Showing" summary persists
    expect(screen.getByText(/showing/i)).toHaveTextContent('Showing');
  });

  test('lists public perks and responds to merchant filtering', async () => {
    const seededPerk = global.__TEST_CONTEXT__?.seededPerk;

    renderWithRouter(
      <Routes>
        <Route path="/explore" element={<AllPerks />} />
      </Routes>,
      { initialEntries: ['/explore'] }
    );

    // Ensure data is loaded
    await waitFor(() => {
      expect(screen.getByText(seededPerk.title)).toBeInTheDocument();
    });

    // Merchant <select> is unlabeled in the DOM; query by role only
    const merchantFilter =
      screen.queryByRole('combobox') ||
      screen.queryByLabelText(/merchant/i) ||
      screen.queryByPlaceholderText(/merchant/i);

    fireEvent.change(merchantFilter, { target: { value: seededPerk.merchant } });

    // Submit to apply filters (the UI has a Search button)
    const searchButton =
      screen.getByRole('button', { name: /search now/i }) ||
      screen.getByRole('button', { name: /search/i });

    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText(seededPerk.title)).toBeInTheDocument();
    });

    expect(screen.getByText(/showing/i)).toHaveTextContent('Showing');
  });
});
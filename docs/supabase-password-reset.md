# Supabase password reset configuration

Restaurants Now Hiring uses Supabase recovery links that must land on the dedicated `/reset-password` page so users can choose a new password instead of being routed through the normal signed-in experience.

## Required Supabase settings

In the Supabase project dashboard:

1. Open **Authentication** → **URL Configuration**.
2. Set the production **Site URL** to:

   ```text
   https://www.restaurantsnowhiring.com
   ```

3. Add this exact production redirect URL to **Redirect URLs**:

   ```text
   https://www.restaurantsnowhiring.com/reset-password
   ```

4. Add any preview or local URLs needed for testing, for example:

   ```text
   http://localhost:3000/reset-password
   ```

## Application behavior

- Forgot-password forms call `resetPasswordForEmail` with a `redirectTo` value on `https://www.restaurantsnowhiring.com/reset-password` in production. The app may append `?type=employer` or `?type=admin` so the reset page can send users back to the right area after the password is updated.
- The reset page accepts Supabase recovery callbacks, including hash-token links and `?code=` links, verifies that the callback is a recovery flow, and only then enables the new-password form.
- After a successful password update, the user is redirected to the employer dashboard by default, or to the admin area for admin reset links.


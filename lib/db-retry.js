/**
 * Database Retry Helper
 * Provides retry logic for database queries to handle cold starts
 */

async function retryQuery(queryFn, context = 'DB Query', maxAttempts = 10) {
    let attempts = 0;
    let lastError = null;

    while (attempts < maxAttempts) {
        try {
            attempts++;
            const result = await queryFn();
            return result;
        } catch (error) {
            lastError = error;
            console.error(`[${context}] DB error (attempt ${attempts}/${maxAttempts}):`, error.message);

            const nonRetriable = ['23505', '23503', '23502', '23514', '42601', '42703', '42P01'];
            if (nonRetriable.includes(error.code)) {
                throw error;
            }

            if (attempts < maxAttempts) {
                const waitTime = 3000 * attempts;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    throw lastError;
}

module.exports = { retryQuery };

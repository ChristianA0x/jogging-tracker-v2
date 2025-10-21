// Import Supabase and node-fetch
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Environment variables will be set in the Netlify UI
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Main function handler
exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const { action } = body;

        switch (action) {
            case 'getData':
                const { data, error } = await supabase.from('activity_log').select('*').order('week_number', { ascending: true });
                if (error) throw error;
                return { statusCode: 200, body: JSON.stringify(data) };

            case 'updateDay':
                 const { week_number, day_of_week, column, value } = body;
                 const { error: updateError } = await supabase.from('activity_log')
                    .update({ [column]: value })
                    .match({ week_number: week_number, day_of_week: day_of_week });
                if (updateError) throw updateError;
                return { statusCode: 200, body: JSON.stringify({ status: 'success' }) };
            
            case 'addWeek':
                const { new_week_number, initialPlan } = body;
                const newWeekData = initialPlan.map(day => ({ ...day, week_number: new_week_number }));
                const { error: insertError } = await supabase.from('activity_log').insert(newWeekData);
                if (insertError) throw insertError;
                return { statusCode: 200, body: JSON.stringify({ status: 'success' }) };

            case 'getWeeklyInsights':
            case 'getMonthlyInsights':
                 const { prompt, systemPrompt } = body;
                 const geminiResponse = await callGeminiApi(prompt, systemPrompt);
                 return { statusCode: 200, body: JSON.stringify(geminiResponse) };

            default:
                return { statusCode: 400, body: 'Unknown action' };
        }

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

async function callGeminiApi(userQuery, systemPrompt) {
    if (!GEMINI_API_KEY) {
        return { error: 'API Key not configured on the server.' };
    }
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        return { error: `Failed to call Gemini API. Status: ${response.status}` };
    }
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? { text } : { error: 'Could not extract text from Gemini API response.' };
}

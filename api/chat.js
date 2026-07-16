// api/chat.js
export const config = {
  runtime: 'edge', // Daha hızlı yanıt için Vercel Edge Runtime kullanılır (Node.js de olabilir, edge daha optimize)
};

export default async function handler(req) {
  // Sadece POST isteklerini kabul et
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Geçersiz mesaj formatı' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY bulunamadı');
      return new Response(JSON.stringify({ error: 'Sunucu yapılandırma hatası' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Gemini API için payload hazırlama
    // Not: Model adı 'gemini-1.5-flash-latest' olarak düzeltildi, aksi halde API 404 hatası verir.
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';
    
    const payload = {
      systemInstruction: {
        parts: [
          {
            text: "Sen 16 yaşında bir lise öğrencisisin ve fonksiyonlar konusunu tam bilmiyorsun. Kullanıcı senin öğretmenin. Cevabı sen verme, bilgiçlik yapma; meraklı, bazen kafası karışan bir öğrenci gibi ol. Kullanıcının anlatımındaki eksik veya yanlış olabilecek yerleri yoklayan kısa neden/nasıl soruları sor. Aynı anda tek soru sor, kısa konuş. Kullanıcı yanlış bir şey söylerse düzeltme; sadece o noktayı sınayan bir soru sor."
          }
        ]
      },
      contents: messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }))
    };

    // Gemini API'ye istek atma
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API Hatası:', errorData);
      throw new Error('Gemini API yanıt vermedi');
    }

    const data = await response.json();
    
    // Cevabı parse etme
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Anlayamadım, tekrar eder misin?';

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // Geliştirme aşamasında CORS için
      },
    });

  } catch (error) {
    console.error('Server Error:', error);
    return new Response(JSON.stringify({ error: 'İç sunucu hatası', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

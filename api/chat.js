export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const body = await req.json();
    const { messages } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Geçersiz mesaj formatı' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY bulunamadı');
      return new Response(JSON.stringify({ error: 'Sunucu yapılandırma hatası' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

   const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

    // Rolleri Gemini formatına çevir; contents mutlaka 'user' ile başlamalı
    let contents = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));
    while (contents.length && contents[0].role !== 'user') {
      contents.shift();
    }

    const payload = {
      systemInstruction: {
        parts: [{ text: "Sen 16 yaşında bir lise öğrencisisin ve fonksiyonlar konusunu tam bilmiyorsun. Kullanıcı senin öğretmenin. Cevabı sen verme, bilgiçlik yapma; meraklı, bazen kafası karışan bir öğrenci gibi ol. Kullanıcının anlatımındaki eksik veya yanlış olabilecek yerleri yoklayan kısa neden/nasıl soruları sor. Aynı anda tek soru sor, kısa konuş. Kullanıcı yanlış bir şey söylerse düzeltme; sadece o noktayı sınayan bir soru sor." }]
      },
      contents
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API Hatası:', errorData);
      return new Response(JSON.stringify({ error: 'Gemini API hatası', details: errorData }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Anlayamadım, tekrar eder misin?';
    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error) {
    console.error('Server Error:', error);
    return new Response(JSON.stringify({ error: 'İç sunucu hatası', details: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

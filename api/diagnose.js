// api/diagnose.js
export const config = {
  runtime: 'edge',
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
      return new Response(JSON.stringify({ error: 'Geçersiz veya boş mesaj dizisi' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY ortam değişkeni bulunamadı');
      return new Response(JSON.stringify({ error: 'Sunucu yapılandırma hatası (API Key eksik)' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Mesajları formatla: İlk mesaj mutlaka 'user' olmalı
    const formattedContents = [];
    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'model') {
        // Eğer dizi boşsa ve gelen mesaj 'model' ise, bunu atla (baştaki model mesajlarını temizle)
        if (formattedContents.length === 0 && msg.role === 'model') {
          continue;
        }
        formattedContents.push({
          role: msg.role,
          parts: [{ text: msg.content }]
        });
      }
    }

    // Güvenlik: Formatlamadan sonra hala boşsa veya 'model' ile başlıyorsa düzelt
    if (formattedContents.length === 0) {
      formattedContents.push({ role: 'user', parts: [{ text: 'Konuşma geçmişi boş.' }] });
    } else if (formattedContents[0].role === 'model') {
      formattedContents.shift();
    }

    // 2. System Instruction
    const systemPrompt = "Sen bir matematik teşhis uzmanısın. Sana bir öğretmen-öğrenci konuşması verilecek; öğretmenin (kullanıcının) fonksiyonlar anlatımını incele. Aşağıdaki listeye göre hangi yanılgılar var belirle. SADECE geçerli JSON döndür, başka hiçbir şey yazma. Format: {\"kodlar\": [\"F05\"], \"aciklama\": \"kısa açıklama\"}. Yanılgı yoksa kodlar boş dizi olsun. Liste: F01/F02/F03=fonksiyon kavramı hataları, F04=görüntü ile değer kümesini karıştırma, F05=f(x+1) yerine koyma hatası (sona ekleme), F08=bileşkeyi çarpma sanma, F10=bileşke sırasını ters uygulama, F11=ters fonksiyonu 1/f sanma, F14=tanım kümesinde paydayı sıfır yapanı unutma, F15=kök içini >0 alma, F18=tek/çift karıştırma.";

    const payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
     contents: formattedContents,
      generationConfig: { thinkingConfig: { thinkingLevel: "minimal" } }
    };

    // 3. Gemini API'ye istek at (İstenen model adı kullanıldı)
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini Diagnose API Hatası:', response.status, errorText);
      throw new Error(`Gemini API yanıt vermedi: ${response.status}`);
    }

    const data = await response.json();
    
    // 4. Cevabı al ve Markdown süslemelerini temizle
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"kodlar":[], "aciklama":"Analiz edilemedi"}';
    
   // JSON'u güvenli çıkar: ilk { ile son } arasını al
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      rawText = rawText.slice(firstBrace, lastBrace + 1);
    }
    // 5. JSON'u parse et
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseError) {
      console.error('JSON Parse Hatası:', parseError, 'Ham metin:', rawText);
      parsed = { kodlar: [], aciklama: "Yanıt JSON formatında parse edilemedi." };
    }

    const kodlar = Array.isArray(parsed.kodlar) ? parsed.kodlar : [];
    const aciklama = typeof parsed.aciklama === 'string' ? parsed.aciklama : "Analiz tamamlandı.";

    // 6. F-Kodlarını Düğüm Adlarına Haritala
    const nodeMap = {
      "Fonksiyon Kavramı": ["F01", "F02", "F03"],
      "Görüntü Kümesi": ["F04"],
      "Fonksiyon Değeri": ["F05"],
      "Bileşke Fonksiyon": ["F08", "F10"],
      "Ters Fonksiyon": ["F11"],
      "Tanım Kümesi": ["F14", "F15"],
      "Tek-Çift Fonksiyon": ["F18"]
    };

    const weakNodesSet = new Set();
    for (const kod of kodlar) {
      for (const [nodeName, validCodes] of Object.entries(nodeMap)) {
        if (validCodes.includes(kod)) {
          weakNodesSet.add(nodeName);
        }
      }
    }

    // 7. Sonucu döndür
    const result = {
      weakNodes: Array.from(weakNodesSet), // Benzersiz düğüm adları
      aciklama: aciklama,
      kodlar: kodlar
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' 
      },
    });

  } catch (error) {
    console.error('Diagnose Server Error:', error);
    return new Response(JSON.stringify({ 
      error: 'İç sunucu hatası', 
      details: error.message,
      weakNodes: [],
      aciklama: "Teşhis sırasında bir hata oluştu.",
      kodlar: []
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

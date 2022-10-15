const GOOGLE_SPEECH_URI = "https://www.google.com/speech-api/v1/synthesize",
  DEFAULT_HISTORY_SETTING = {
    enabled: true,
  };

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { word, lang } = request,
    url = `https://www.google.com/search?hl=${lang}&q=define+${word}&gl=US`;

  fetch(url, {
    method: "GET",
    credentials: "omit",
  })
    .then((response) => response.text())
    .then((text) => {
      const document = new DOMParser().parseFromString(text, "text/html"),
        content = extractMeaning(document, { word, lang });

      sendResponse({ content });

      content &&
        browser.storage.local.get().then((results) => {
          let history = results.history || DEFAULT_HISTORY_SETTING;

          history.enabled && saveWord(content);
        });
    });

  return true;
});

function extractMeaning(document, context) {
  if (!document.querySelector("[data-dobid='hdw']")) {
    return null;
  }

  var word = document.querySelector("[data-dobid='hdw']").textContent,
    definitionDiv = document.querySelector("div[data-dobid='dfn']"),
    meaning = "";

  if (definitionDiv) {
    definitionDiv.querySelectorAll("span").forEach(function (span) {
      if (!span.querySelector("sup")) meaning = meaning + span.textContent;
    });
  }

  meaning = meaning[0].toUpperCase() + meaning.substring(1);

  var audio = document.querySelector("audio[jsname='QInZvb']"),
    source = document.querySelector("audio[jsname='QInZvb'] source"),
    audioSrc = source && source.getAttribute("src");

  if (audioSrc) {
    !audioSrc.includes("http") &&
      (audioSrc = audioSrc.replace("//", "https://"));
  } else if (audio) {
    let exactWord = word.replace(/·/g, ""), // We do not want syllable seperator to be present.
      queryString = new URLSearchParams({
        text: exactWord,
        enc: "mpeg",
        lang: context.lang,
        speed: "0.4",
        client: "lr-language-tts",
        use_google_only_voices: 1,
      }).toString();

    audioSrc = `${GOOGLE_SPEECH_URI}?${queryString}`;
  }

  return { word: word, meaning: meaning, audioSrc: audioSrc };
}

function saveWord(content) {
  let word = content.word,
    meaning = content.meaning,
    storageItem = browser.storage.local.get();

  storageItem.then((results) => {
    let definitions = results.definitions || {};
    const token = results.authToken || "";
    const channel = results.channel || "";

    let form_data = new FormData();
    form_data.append("token", token);
    form_data.append("channel", channel);
    form_data.append("text", `*${word}*\n` + `- ${meaning}`);

    if (!definitions[word]) {
      fetch("https://slack.com/api/chat.postMessage", {
        mode: "cors",
        method: "POST",
        body: form_data,
      })
        .then((test) => test.json())
        .then((data) => data);
    }

    definitions[word] = meaning;
    browser.storage.local.set({
      definitions,
    });
  });
}

# 汉语 · Trainer

A mobile-friendly web app for learning Chinese words and characters. Russian interface, Chinese flashcards. Works as a PWA — installable on your phone and available offline.

**[Open the app](https://refolit.github.io/Lang-trainer/)**

![Screenshot of the app](screenshot.png)

## Features

- **Dictionary** — a list of words with translations, pinyin, and stroke-by-stroke character writing.
- **Learn** — flashcards with spaced repetition (SRS, 5 boxes).
- **Write** — animated stroke-order practice for characters (HanziWriter).
- **Exam** — knowledge checks with results and a list of mistakes.
- **Statistics** — progress, learned words, and history.
- **JSON import / export** — back up your data at any time.

## How to install on your phone

1. Open the app in your phone's browser:
   `https://refolit.github.io/Lang-trainer/`
2. Choose **Add to Home Screen** (in Android Chrome / iOS Safari).
3. The app will appear as a regular icon and will work without internet.

Your words and progress are stored locally on your device (IndexedDB).

## Built with

- [HanziWriter 3.6](https://github.com/chanind/hanzi-writer) — animated character writing.
- [pinyin-pro 3.29.4](https://github.com/zh-lx/pinyin-pro) — pinyin generation.
- [hanzi-writer-data 2.0.0](https://www.npmjs.com/package/hanzi-writer-data) — character stroke data.
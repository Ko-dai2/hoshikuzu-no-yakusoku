require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');

// 設定
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
};

const app = express();
const client = new line.Client(config);

// シナリオデータを読み込み
const scenario = JSON.parse(fs.readFileSync('scenario.json', 'utf8'));

// ユーザーの状態を保存（メモリ内）
const users = {};

// ユーザーの初期状態
function initUser(userId) {
  users[userId] = {
    currentScene: 'prologue_start',
    chapter: 0,
    memory: 0,      // 記憶値
    bond: 0,        // 絆値
    resolve: 0,     // 決意値
    choices: []     // 選択履歴
  };
}

// 現在のシーンデータを取得
function getScene(sceneId) {
  return scenario[sceneId];
}

// メッセージを送信
async function sendMessage(userId, scene) {
  const messages = [];
  
  // テキストメッセージ
  messages.push({
    type: 'text',
    text: scene.text
  });
  
  // 選択肢がある場合
  if (scene.choices && scene.choices.length > 0) {
    const quickReply = {
      items: scene.choices.map(choice => ({
        type: 'action',
        action: {
          type: 'message',
          label: choice.label,
          text: choice.value
        }
      }))
    };
    
    messages[0].quickReply = quickReply;
  } else if (scene.next) {
    // 選択肢がない場合は「次へ」ボタン
    messages[0].quickReply = {
      items: [{
        type: 'action',
        action: {
          type: 'message',
          label: '次へ',
          text: 'next'
        }
      }]
    };
  }
  
  return client.replyMessage(users[userId].replyToken, messages);
}

// ユーザーの選択を処理
function handleUserChoice(userId, text) {
  const user = users[userId];
  const currentScene = getScene(user.currentScene);
  
  // 選択肢がある場合
  if (currentScene.choices) {
    const choice = currentScene.choices.find(c => c.value === text);
    
    if (choice) {
      // 選択履歴に追加
      user.choices.push({
        scene: user.currentScene,
        choice: choice.value
      });
      
      // 次のシーンへ
      user.currentScene = choice.next;
      
      // パラメータ更新（選択肢にparamsがある場合）
      if (choice.params) {
        if (choice.params.memory) user.memory += choice.params.memory;
        if (choice.params.bond) user.bond += choice.params.bond;
        if (choice.params.resolve) user.resolve += choice.params.resolve;
      }
      
      return true;
    }
  }
  
  // 「次へ」の場合
  if (text === 'next' && currentScene.next) {
    user.currentScene = currentScene.next;
    
    // シーン自体にparamsがある場合
    if (currentScene.params) {
      if (currentScene.params.memory) user.memory += currentScene.params.memory;
      if (currentScene.params.bond) user.bond += currentScene.params.bond;
      if (currentScene.params.resolve) user.resolve += currentScene.params.resolve;
    }
    
    return true;
  }
  
  return false;
}

// Webhookエンドポイント
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    
    await Promise.all(events.map(async (event) => {
      if (event.type !== 'message' || event.message.type !== 'text') {
        return null;
      }
      
      const userId = event.source.userId;
      const text = event.message.text;
      
      // 初めてのユーザーまたは「最初から」コマンド
      if (!users[userId] || text === '最初から') {
        initUser(userId);
      }
      
      // replyTokenを保存（メッセージ送信に必要）
      users[userId].replyToken = event.replyToken;
      
      // ユーザーの選択を処理
      const validChoice = handleUserChoice(userId, text);
      
      if (!validChoice && text !== '最初から') {
        // 無効な入力の場合
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '選択肢から選んでください。'
        });
      }
      
      // 現在のシーンを送信
      const currentScene = getScene(users[userId].currentScene);
      
      if (currentScene) {
        return sendMessage(userId, currentScene);
      } else {
        // シーンが存在しない場合（物語終了）
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '物語はここで終わりです。お疲れ様でした！\n\n最初から始める場合は「最初から」と入力してください。'
        });
      }
    }));
    
    res.status(200).end();
  } catch (err) {
    console.error('Error:', err);
    res.status(500).end();
  }
});

// ヘルスチェック用
app.get('/', (req, res) => {
  res.send('Bot is running!');
});

// サーバー起動
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
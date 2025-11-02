require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');

// LINE設定
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
};

const app = express();
const client = new line.Client(config);

// 起動時の環境変数確認
console.log('========================================');
console.log('Bot Starting...');
console.log('Channel Secret:', process.env.CHANNEL_SECRET ? 'Configured' : 'MISSING');
console.log('Channel Access Token:', process.env.CHANNEL_ACCESS_TOKEN ? 'Configured' : 'MISSING');
console.log('========================================');

// シナリオデータの読み込み
let scenario = {};
try {
  const scenarioData = fs.readFileSync('scenario.json', 'utf8');
  scenario = JSON.parse(scenarioData);
  console.log('Scenario loaded successfully.');
  console.log('Available scenes:', Object.keys(scenario).length);
  console.log('========================================');
} catch (error) {
  console.error('FATAL ERROR: Failed to load scenario.json');
  console.error(error.message);
  process.exit(1);
}

// ユーザーデータをメモリに保存
const userData = {};

// ユーザーの初期化
function initializeUser(userId) {
  userData[userId] = {
    currentSceneId: 'prologue_start',
    chapter: 0,
    memory: 0,
    bond: 0,
    resolve: 0,
    curiosity: 0,
    history: []
  };
  console.log(`User initialized: ${userId}`);
  return userData[userId];
}

// ユーザーデータの取得（存在しない場合はnull）
function getUser(userId) {
  return userData[userId] || null;
}

// シーンデータの取得
function getSceneData(sceneId) {
  const scene = scenario[sceneId];
  if (!scene) {
    console.error(`Scene not found: ${sceneId}`);
    return null;
  }
  return scene;
}

// パラメータの更新
function updateParameters(user, params) {
  if (!params) return;
  
  if (params.memory) {
    user.memory += params.memory;
    console.log(`Memory updated: ${user.memory}`);
  }
  if (params.bond) {
    user.bond += params.bond;
    console.log(`Bond updated: ${user.bond}`);
  }
  if (params.resolve) {
    user.resolve += params.resolve;
    console.log(`Resolve updated: ${user.resolve}`);
  }
  if (params.curiosity) {
    user.curiosity += params.curiosity;
    console.log(`Curiosity updated: ${user.curiosity}`);
  }
}

// エンディング判定
function determineEnding(user) {
  const { memory, bond, resolve, curiosity } = user;
  
  console.log('========================================');
  console.log('Determining ending...');
  console.log(`Parameters: memory=${memory}, bond=${bond}, resolve=${resolve}, curiosity=${curiosity}`);
  
  // Bad End判定（最優先）
  if (memory >= 6 && (bond <= 2 || resolve <= 2)) {
    console.log('Ending determined: Bad End');
    console.log('========================================');
    return 'ending_bad_start';
  }
  
  // True End判定
  if (memory >= 4 && bond >= 4 && resolve >= 4 && curiosity >= 4) {
    console.log('Ending determined: Radiant End (True End)');
    console.log('========================================');
    return 'ending_radiant_start';
  }
  
  // Bond End判定
  if (bond >= 5 && bond > memory && bond > resolve && bond > curiosity) {
    console.log('Ending determined: Bond End');
    console.log('========================================');
    return 'ending_bond_start';
  }
  
  // Resolve End判定
  if (resolve >= 5 && resolve > memory && resolve > bond && resolve > curiosity) {
    console.log('Ending determined: Resolve End');
    console.log('========================================');
    return 'ending_resolve_start';
  }
  
  // Curiosity End判定
  if (curiosity >= 4 && curiosity > memory && curiosity > bond && curiosity > resolve) {
    console.log('Ending determined: Curiosity End');
    console.log('========================================');
    return 'ending_curiosity_start';
  }
  
  // デフォルト（最も高いパラメータで判定）
  const maxParam = Math.max(memory, bond, resolve, curiosity);
  
  if (bond === maxParam) {
    console.log('Ending determined: Bond End (default - bond highest)');
    console.log('========================================');
    return 'ending_bond_start';
  }
  if (resolve === maxParam) {
    console.log('Ending determined: Resolve End (default - resolve highest)');
    console.log('========================================');
    return 'ending_resolve_start';
  }
  if (curiosity === maxParam) {
    console.log('Ending determined: Curiosity End (default - curiosity highest)');
    console.log('========================================');
    return 'ending_curiosity_start';
  }
  
  // 最終的なデフォルト（Bond End）
  console.log('Ending determined: Bond End (final default)');
  console.log('========================================');
  return 'ending_bond_start';
}

// LINEメッセージの作成
function createLineMessage(scene) {
  const message = {
    type: 'text',
    text: scene.text
  };
  
  // 選択肢がある場合はクイックリプライを追加
  if (scene.choices && Array.isArray(scene.choices) && scene.choices.length > 0) {
    message.quickReply = {
      items: scene.choices.map(choice => ({
        type: 'action',
        action: {
          type: 'message',
          label: choice.label,
          text: choice.label
        }
      }))
    };
  } else if (scene.next) {
    // 選択肢がない次のシーンがある場合は「次へ」ボタン
    message.quickReply = {
      items: [{
        type: 'action',
        action: {
          type: 'message',
          label: '次へ',
          text: '__next__'
        }
      }]
    };
  }
  
  return message;
}

// ユーザーの入力を処理
function processUserInput(user, inputText) {
  const currentScene = getSceneData(user.currentSceneId);
  
  if (!currentScene) {
    console.error(`Current scene not found: ${user.currentSceneId}`);
    return null;
  }
  
  console.log(`Processing input: "${inputText}" at scene: ${user.currentSceneId}`);
  
  // 「次へ」ボタンの処理
  if (inputText === '__next__') {
    if (currentScene.next) {
      // シーン自体のパラメータを更新
      updateParameters(user, currentScene.params);
      
      // chapter5_decisionの場合はエンディング判定を行う
      if (currentScene.id === 'chapter5_decision') {
        const endingSceneId = determineEnding(user);
        user.currentSceneId = endingSceneId;
        user.history.push({
          from: currentScene.id,
          to: endingSceneId,
          choice: '__ending_determined__'
        });
        return getSceneData(user.currentSceneId);
      }
      
      user.currentSceneId = currentScene.next;
      user.history.push({
        from: currentScene.id,
        to: currentScene.next,
        choice: '__next__'
      });
      
      return getSceneData(user.currentSceneId);
    } else {
      console.log('No next scene available');
      return null;
    }
  }
  
  // 選択肢の処理（labelまたはvalueで検索）
  if (currentScene.choices && Array.isArray(currentScene.choices)) {
    // まずlabelで検索、なければvalueで検索
    let selectedChoice = currentScene.choices.find(choice => choice.label === inputText);
    if (!selectedChoice) {
      selectedChoice = currentScene.choices.find(choice => choice.value === inputText);
    }
    
    if (selectedChoice) {
      console.log(`Valid choice selected: ${selectedChoice.label}`);
      
      // 選択肢のパラメータを更新
      updateParameters(user, selectedChoice.params);
      
      user.currentSceneId = selectedChoice.next;
      user.history.push({
        from: currentScene.id,
        to: selectedChoice.next,
        choice: inputText
      });
      
      return getSceneData(user.currentSceneId);
    }
  }
  
  console.log('Invalid input received');
  return 'INVALID_INPUT';
}

// メインのWebhookハンドラー
app.post('/webhook', line.middleware(config), async (req, res) => {
  console.log('');
  console.log('========================================');
  console.log('Webhook received');
  console.log('========================================');
  
  try {
    const events = req.body.events;
    
    if (!events || events.length === 0) {
      console.log('No events in request');
      return res.status(200).end();
    }
    
    const results = await Promise.all(events.map(handleEvent));
    
    console.log('All events processed successfully');
    res.status(200).end();
  } catch (error) {
    console.error('========================================');
    console.error('ERROR in webhook handler:');
    console.error(error);
    console.error('========================================');
    res.status(500).end();
  }
});

// 個別イベントの処理
async function handleEvent(event) {
  console.log(`Event type: ${event.type}`);
  
  // テキストメッセージ以外は無視
  if (event.type !== 'message' || event.message.type !== 'text') {
    console.log('Event ignored (not a text message)');
    return Promise.resolve(null);
  }
  
  const userId = event.source.userId;
  const userMessage = event.message.text;
  const replyToken = event.replyToken;
  
  console.log(`User: ${userId}`);
  console.log(`Message: "${userMessage}"`);
  
  try {
    // 「物語を始めますか？」で開始
    if (userMessage === '物語を開始中……') {
      console.log('Starting new story');
      const user = initializeUser(userId);
      const firstScene = getSceneData(user.currentSceneId);
      
      if (!firstScene) {
        throw new Error('First scene not found');
      }
      
      const message = createLineMessage(firstScene);
      return client.replyMessage(replyToken, message);
    }
    
    // 「最初から」でリセット
    if (userMessage === '最初から') {
      console.log('Resetting story');
      const user = initializeUser(userId);
      const firstScene = getSceneData(user.currentSceneId);
      
      if (!firstScene) {
        throw new Error('First scene not found');
      }
      
      const message = createLineMessage(firstScene);
      return client.replyMessage(replyToken, message);
    }
    
    // ユーザーが未登録の場合
    const user = getUser(userId);
    if (!user) {
      console.log('User not found, sending welcome message');
      return client.replyMessage(replyToken, {
        type: 'text',
        text: '物語を開始するには「物語を開始中……」と入力してください。'
      });
    }
    
    // ユーザーの入力を処理
    const nextScene = processUserInput(user, userMessage);
    
    if (nextScene === 'INVALID_INPUT') {
      console.log('Sending invalid input message');
      return client.replyMessage(replyToken, {
        type: 'text',
        text: '表示されている選択肢から選んでください。'
      });
    }
    
    if (!nextScene) {
      console.log('Story ended, sending completion message');
      return client.replyMessage(replyToken, {
        type: 'text',
        text: '物語はここで終わりです。お疲れ様でした！\n\n最初から始める場合は「物語を開始中……」と入力してください。'
      });
    }
    
    // 次のシーンを送信
    const message = createLineMessage(nextScene);
    return client.replyMessage(replyToken, message);
    
  } catch (error) {
    console.error('Error handling event:', error);
    
    // エラー時はユーザーにメッセージを送信
    return client.replyMessage(replyToken, {
      type: 'text',
      text: 'エラーが発生しました。「最初から」と入力してやり直してください。'
    }).catch(err => {
      console.error('Failed to send error message:', err);
    });
  }
}

// ヘルスチェック用エンドポイント
app.get('/', (req, res) => {
  res.send('LINE Bot is running!');
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  console.log('========================================');
});

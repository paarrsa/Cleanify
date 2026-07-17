<?php
//###############################################
// Requirements ---------------------------------
require_once('src/core.php');
$servername = "localhost";
$username = "paarrs_config";
$password = ">x9VQ#mWkM3?L%'";
$db = "paarrs_bot";
$conn = mysqli_connect($servername, $username, $password, $db);
// ----------------------------------------------
//###############################################
// Proccessing Request --------------------------
$content = file_get_contents('php://input');
$update = json_decode($content, true);
$text = '';
if(!isset($update["message"]) && !isset($update['callback_query'])) {
  exit();
}
if(isset($update["message"])) {
    $message = $update["message"];
    $chat_id = $message["chat"]["id"];
    if(isset($message["chat"]["username"])) {
        $username = $message["chat"]["username"];
    } else {
        $username = null;
    }
    if(isset($message["text"])) {
        $text = $message["text"];
    }
} else if(isset($update['callback_query'])) {
    $text = $update['callback_query']['data'];
    $chat_id = $update['callback_query']['from']['id'];
    if(isset($update['callback_query']['from']['username'])) {
        $username = $update['callback_query']['from']['username'];
    } else {
        $username = null;
    }
}
// ----------------------------------------------
//###############################################
// Checking User Info And Request Content --------
$select_query = "SELECT status, channel, first_msg, second_msg, lang FROM Cleanify WHERE user = ?";
$stmt = $conn->prepare($select_query);
$stmt->bind_param("s", $chat_id);
$stmt->execute();
$stmt->bind_result($status, $channel, $first_msg, $second_msg, $lang);
$stmt->fetch();

// Closing the statement after fetching data
$stmt->close();

if ($status == null) {
    // User does not exist, so insert new user
    $insert_query = "INSERT INTO Cleanify (user, username) VALUES (?, ?)";
    $stmt = $conn->prepare($insert_query);
    $stmt->bind_param("ss", $chat_id, $username);
    $stmt->execute();
} else {
    // User exists, so update username
    $update_query = "UPDATE Cleanify SET username = ? WHERE user = ?";
    $stmt = $conn->prepare($update_query);
    $stmt->bind_param("ss", $username, $chat_id);
    $stmt->execute();
}

// Closing the statement after update/insert
$stmt->close();
// ----------------------------------------------
//###############################################
// Language Setting -----------------------------
switch ($text) {
    case "/fa":
        $conn->query("UPDATE Cleanify SET lang='fa' WHERE user=$chat_id");
        MessageRequestJson(
            'sendMessage',
            array(
              'chat_id' => $chat_id,
              'text' => "سلام من کلینیفای ام! کمک میخوای؟ \n اگر بار اول هستش از من استفاده میکنی قسمت آموزش رو ببین 3>",
              'reply_markup' => array(
                'resize_keyboard' => true,
                'keyboard' => array(
                  array('برام پیام هام رو پاک کن!'),
                  array('آموزش', 'پشتیبانی')
                )
              )
            )
        );
        exit();
    break;
    case "/en":
        $conn->query("UPDATE Cleanify SET lang='en' WHERE user=$chat_id");
        MessageRequestJson(
            'sendMessage',
            array(
              'chat_id' => $chat_id,
              'text' => "Hello, I'm Cleanify! How can i help you?\nIf this is your first time using me, please read the help section <3",
              'reply_markup' => array(
                'resize_keyboard' => true,
                'keyboard' => array(
                  array('Delete message for me!'),
                  array('Help', 'Support')
                )
              )
            )
        );
        exit();
    break;
}
if($lang == 'en') {
    require_once('src/en.php');
} else if($lang == 'fa') {
    require_once('src/fa.php');
} else if($lang == null) {
    MessageRequestJson("sendMessage", array('chat_id' =>$chat_id, 'text' => "Please select a language:", 'reply_markup' => array(
            "inline_keyboard" => array(
                array(
                    array("text" => "🇮🇷 Persian", "callback_data" => "/fa"),
                    array("text" => "🇬🇧 English", "callback_data" => "/en"),
                )
            )
    )));
    exit();
}
// ----------------------------------------------
//###############################################
// Functions ------------------------------------
// Checking Channel Function -------------------
function checkChannel() {
    global $text;
    global $chat_id;
    global $adminerror_text;
    global $deniederror_text;
    global $conn;
    global $delete_command_txt;
    global $help_command_txt;
    global $support_command_txt;
    global $channelerror_text;
    global $message;
    
    if(!isset($message['forward_origin']) ||
    $message['forward_origin']['type'] != 'channel') {
        mysqli_query($conn, "UPDATE Cleanify SET status='idle' WHERE user=$chat_id");
        MessageRequestJson(
            'sendMessage',
            array(
                'chat_id' => $chat_id,
                'text' => $channelerror_text,
                'reply_markup' => array(
                    'resize_keyboard' => true,
                    'keyboard' => array(
                      array($delete_command_txt),
                      array($help_command_txt, $support_command_txt)
                    )
                )
            )
        );
        exit();
    }
    $channelID = $message['forward_origin']['chat']['id'];
    if(isset($message['forward_origin']['chat']['username'])) {
        $channelUsername = $message['forward_origin']['chat']['username'];
    } else {
        $channelUsername = null;
    }
    $checkingReq = MessageRequestJson(
        'getChatMember',
        array(
          'chat_id' => $channelID,
          'user_id' => $chat_id
        )
    );
    $checking = json_decode($checkingReq, true);
    $ok = $checking['ok'];
    if($ok == false) {
        mysqli_query($conn, "UPDATE Cleanify SET status='idle' WHERE user= $chat_id");
        MessageRequestJson(
          'sendMessage',
          array(
            'chat_id' => $chat_id,
            'text' => $adminerror_text,
            'reply_markup' => array(
              'resize_keyboard' => true,
              'keyboard' => array(
                array($delete_command_txt),
                array($help_command_txt, $support_command_txt)
              )
            )
          )
        );
    } else if($ok == true) {
        if($checking['result']['status'] == 'creator' || $checking['result']['status'] == 'administrator') {
            $sql = "UPDATE Cleanify SET channel = ?, channel_username = ? WHERE user = ?";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("ssi", $channelID, $channelUsername, $chat_id);
            $stmt->execute();
            $stmt->close();
            return(true);
        } else {
          mysqli_query($conn, "UPDATE Cleanify SET status='idle' WHERE user= $chat_id");
          MessageRequestJson(
              'sendMessage',
              array(
                'chat_id' => $chat_id,
                'text' => $deniederror_text,
                'reply_markup' => array(
                  'resize_keyboard' => true,
                  'keyboard' => array(
                    array($delete_command_txt),
                    array($help_command_txt, $support_command_txt)
                  )
                )
              )
            );
        }
    }
    return(false);
}
// ----------------------------------------------
// Selecting First Message Function -------------
function SendingFirstMessage() {
    global $text;
    global $chat_id;
    global $secondmsg_text;
    global $conn;
    global $delete_command_txt;
    global $help_command_txt;
    global $support_command_txt;
    global $message;
    
    $first = $message['forward_origin']['message_id'];
    mysqli_query($conn, "UPDATE Cleanify SET status='sending second message', first_msg=$first WHERE user=$chat_id");
    MessageRequestJson(
        'sendMessage',
        array(
            'chat_id' => $chat_id,
            'text' => $secondmsg_text,
            'reply_markup' => array(
                'resize_keyboard' => true,
                'keyboard' => array(
                    array('Cancel'),
                )
            )
        )
    );
}
// ----------------------------------------------
// Selecting Second Message Function ------------
function SendingSecondMessage()  {
    global $text;
    global $chat_id;
    global $tnx_text;
    global $channel;
    global $first_msg;
    global $conn;
    global $delete_command_txt;
    global $help_command_txt;
    global $support_command_txt;
    global $diffrentChannelError_text;
    global $message;
    global $cleaning_txt;
    global $wating_txt;
    
    if(!isset($message['forward_origin']['chat']['id']) || $channel != $message['forward_origin']['chat']['id']) {
        mysqli_query($conn, "UPDATE Cleanify SET status='idle' WHERE user=$chat_id");
        MessageRequestJson(
            'sendMessage',
            array(
                'chat_id' => $chat_id,
                'text' => $diffrentChannelError_text,
                'reply_markup' => array(
                    'resize_keyboard' => true,
                    'keyboard' => array(
                      array($delete_command_txt),
                      array($help_command_txt, $support_command_txt)
                    )
                )
            )
        );
        exit();
    }
    
    $wating = MessageRequestJson(
        'sendMessage',
        array(
            'chat_id' => $chat_id,
            'text' => $wating_txt,
        )
    );
    $cleaning = MessageRequestJson(
        'sendMessage',
        array(
            'chat_id' => $channel,
            'text' => $cleaning_txt,
            'parse_mode' => 'HTML',
            'link_preview_options' => array(
                'is_disabled' => true    
            )
        )
    );
    $cleaning = json_decode($cleaning);
    $cleaning_id = $cleaning->result->message_id;
    $wating = json_decode($wating);
    $wating_id = $wating->result->message_id;
    
    sleep(5);
    
    MessageRequestJson(
        'deleteMessage',
        array(
            'chat_id' => $channel,
            'message_id' => $cleaning_id,
        )
    );
    MessageRequestJson(
        'deleteMessage',
        array(
            'chat_id' => $chat_id,
            'message_id' => $wating_id,
        )
    );

    
    $second = $message['forward_origin']['message_id'];
    mysqli_query($conn, "UPDATE Cleanify SET second_msg=$second WHERE user=$chat_id");
    $i = $first_msg;
    $x = $second;
    $range = array();
    if($i <= $x) {
        $range = array_merge($range, range($i, $x));
    }
    if (count($range) > 100) {
        $chunks = array_chunk($range, 100);
        foreach ($chunks as $chunk) {
            MessageRequestJson(
                'deleteMessages',
                array(
                  'chat_id' => $channel,
                  'message_ids' => $chunk,
                )
            );
        }
    } else {
        MessageRequestJson(
            'deleteMessages',
            array(
              'chat_id' => $channel,
              'message_ids' => $range,
            )
        );
    }
    MessageRequestJson(
        'sendMessage',
        array(
          'chat_id' => $chat_id,
          'text' => $tnx_text,
          'reply_markup' => array(
            'resize_keyboard' => true,
            'keyboard' => array(
              array($delete_command_txt),
              array($help_command_txt, $support_command_txt)
            )
          )
        )
    );
    mysqli_query($conn, "UPDATE Cleanify SET status='idle' WHERE user= $chat_id");
}
// ----------------------------------------------
//-----------------------------------------------
//###############################################
// If The User Wants To Cancel ------------------
if ($text == 'Cancel') {
  mysqli_query($conn, "UPDATE Cleanify SET status='idle' WHERE user= $chat_id");
  MessageRequestJson(
    'sendMessage',
    array(
      'chat_id' => $chat_id,
      'text' => $start_text,
      'reply_markup' => array(
        'resize_keyboard' => true,
        'keyboard' => array(
          array($delete_command_txt),
          array($help_command_txt, $support_command_txt)
        )
      )
    )
  );
  exit();
}
// ----------------------------------------------
//###############################################
// Checking User Status -------------------------
switch ($status) {
    case 'sending first message':
        $checkChannel = checkChannel();
        if($checkChannel == true) {
            SendingFirstMessage();
            exit();
        } else {
            exit();
        }
    break;
    case 'sending second message':
        SendingSecondMessage();
        exit();
    break;
}
// ----------------------------------------------
//###############################################
// Basic Commands -------------------------------
switch ($text) {
    case "/start":
        MessageRequestJson(
            'sendMessage',
            array(
              'chat_id' => $chat_id,
              'text' => $start_text,
              'reply_markup' => array(
                'resize_keyboard' => true,
                'keyboard' => array(
                  array($delete_command_txt),
                  array($help_command_txt, $support_command_txt)
                )
              )
            )
        );
    break;
    case $support_command_txt:
        MessageRequestJson(
            'sendMessage',
            array(
              'chat_id' => $chat_id,
              'text' => $supp_text,
            )
        );
    break;
    case $help_command_txt:
        MessageRequestJson(
            'sendVideo',
            array(
              'chat_id' => $chat_id,
              'video' => 'BAACAgEAAxkBAAIGrmYPaspASurJ7IsXSKJ74EPeHIkDAALUAwACMLl4RE3aB-f2nw8NNAQ',
              'caption' => $help_text,
              'supports_streaming' => true
            )
        );
    break;
    case $delete_command_txt:
        mysqli_query($conn, "UPDATE Cleanify SET status='sending first message' WHERE user= $chat_id");
        MessageRequestJson(
            'sendMessage',
            array(
                'chat_id' => $chat_id,
                'text' => $firstmsg_text,
                'reply_markup' => array(
                    'resize_keyboard' => true,
                    'keyboard' => array(
                        array('Cancel'),
                    )
                )
            )
        );
    break;
    default:
        MessageRequestJson(
            'sendMessage',
            array(
              'chat_id' => $chat_id,
              'text' => $invalid_text,
              'reply_markup' => array(
                'resize_keyboard' => true,
                'keyboard' => array(
                  array($delete_command_txt),
                  array($help_command_txt, $support_command_txt)
                )
              )
            )
        );
}
// ----------------------------------------------
//###############################################
?>
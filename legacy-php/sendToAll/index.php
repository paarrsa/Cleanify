<?php

// Database informations
$servername = "localhost";
$username = "paarrs_config";
$password = ">x9VQ#mWkM3?L%'";
$db = "paarrs_bot";

// Create connection
$conn = mysqli_connect($servername, $username, $password, $db);

define('BOT_TOKEN', '6681460464:AAFSpF3ylM4wsf4KC6QpprHoi95aIEBlqCM');
define('API_URL', 'https://api.telegram.org/bot'.BOT_TOKEN.'/');

function MessageRequestJson($method, $parameters) {

    if (!$parameters) {
        $parameters = array();
    }

    $parameters['method'] = $method;

    $handle = curl_init(API_URL);
    curl_setopt($handle, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($handle, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($handle, CURLOPT_TIMEOUT, 60);
    curl_setopt($handle, CURLOPT_POSTFIELDS, json_encode($parameters));
    curl_setopt($handle, CURLOPT_HTTPHEADER, array("Content-Type: application/json"));
    $result = curl_exec($handle);
    return $result; 
}

function sendMessageToAllUsers($mysqli, $message_text) {
    // Fetch all user IDs from the database
    $sql = "SELECT user FROM Cleanify";
    $result = $mysqli->query($sql);

    // Loop through each user and send the message
    while ($row = $result->fetch_assoc()) {
        $chat_id = $row['user'];

        // Send the message to each user
        MessageRequestJson("sendMessage", array(
            'chat_id' => $chat_id,
            'text' => $message_text
        ));
    }

    // Close the result set
    $result->close();
}

// Example usage:
$message_text = "سلام امیدوارم حالتون خوب باشه:cupid:
واقعا ممنون که از کلینیفای استفاده میکنید. (یا حداقل استفاده میکردید:face_with_hand_over_mouth:) امروز از یکی از دوستان شنیدم که مثل اینکه دارن کلینیفای رو میفروشن که درستی یا نادرستی این ماجرا رو نمیدونم اما خواستم اطلاع بدم که کلینیفای کاملا رایگان هستش و اگر بهتون فروخته شده لطفا به آیدی زیر پیام بدید:
@FormerlyGod
همچنین من یه بات دیگه هم به اسم آنلی دارم که یه بات ناشناس هست که بهتون قابلیت های جالبی مثل کنترل پیام های ذخیره شدتون در دیتابیس و پاک کردنشون رو میده که خوشحال میشم امتحانش کنید:
@UnknownlyBot";
sendMessageToAllUsers($conn, $message_text);

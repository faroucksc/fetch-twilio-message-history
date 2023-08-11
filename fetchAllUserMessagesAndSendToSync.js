const accountSid = process.env.TWILIO_ACCOUNT_SID_Flexowly2;
const authToken = process.env.TWILIO_AUTH_TOKEN_Flexowly2;
const client = require('twilio')(accountSid, authToken);
const SYNC_SERVICE_SID = 'IS74eaf011a1e7a1144c0867b6419ef4bc';

const payload = {
    customerId: "jdoes1",
    identifiers: ["+14049401288", "+14043338820", "chatID00498"]
};

async function fetchMessagesFromMessagingAPI(phoneNumber) {
    console.log(`Fetching messages from Messaging API for ${phoneNumber}...`);
    let messagesTo = await client.messages.list({to: phoneNumber});
    let messagesFrom = await client.messages.list({from: phoneNumber});
    return { messages: [...messagesTo, ...messagesFrom], source: 'MessagingAPI' };
}

async function fetchConversationsFromConversationsAPI(identifier) {
    console.log(`Fetching messages from Conversations API for ${identifier}...`);
    let conversations = [];
    await client.conversations.v1.participantConversations
        .each({address: identifier}, async (p) => {
            const messagesData = await client.conversations.v1.conversations(p.conversationSid).messages.list();
            conversations.push({
                conversationSid: p.conversationSid,
                lastUpdated: p.conversationDateUpdated,
                messages: messagesData,
                source: 'ConversationsAPI'
            });
        });
    return conversations;
}

function groupMessagesByMessagingAPI(allData, phoneNumber) {
    console.log("Grouping messages from Messaging API by participant...");
    let grouped = {};
    for (let message of allData.messages) {
        let otherParticipant = message.from === phoneNumber ? message.to : message.from;
        if (!grouped[otherParticipant]) {
            grouped[otherParticipant] = {
                messages: [],
                source: allData.source
            };
        }
        let messageData = {
            author: message.from,
            body: message.body,
            dateSent: message.dateCreated
        };
        if (message.media && message.media.length > 0) {
            messageData.attachments = message.media.map(media => media.url);
        }
        grouped[otherParticipant].messages.push(messageData);
    }
    return grouped;
}

function groupMessagesByConversationsAPI(conversationsData) {
    console.log("Grouping messages from Conversations API by conversation SID...");
    let grouped = {};
    for (let convo of conversationsData) {
        let messageList = [];
        for (let message of convo.messages) {
            messageList.push({
                author: message.author,
                body: message.body,
                dateSent: message.dateCreated
            });
        }
        grouped[convo.conversationSid] = {
            messages: messageList,
            source: convo.source
        };
    }
    return grouped;
}

async function ensureSyncServiceExists() {
    console.log("Ensuring Sync Service exists...");
    try {
        await client.sync.services(SYNC_SERVICE_SID).fetch();
        console.log("Sync Service already exists.");
    } catch (err) {
        if (err.status === 404) {
            console.log("Sync Service does not exist. Creating...");
            await client.sync.services.create({sid: SYNC_SERVICE_SID});
            console.log("Sync Service created successfully.");
        } else {
            throw err;
        }
    }
}

function generateSyncListName(payload) {
    if (payload.customerId) {
        return `UnifiedMessagesList_${payload.customerId}`;
    } else if (payload.identifiers && payload.identifiers.length > 0) {
        const concatenatedIdentifiers = payload.identifiers.sort().join('').replace(/\W/g, '');
        return `UnifiedMessagesList_${concatenatedIdentifiers}`;
    } else {
        throw new Error("No valid customerId or identifier found in the payload");
    }
}

async function createOrUpdateSyncList(groupedData) {
    await ensureSyncServiceExists();

    const listName = generateSyncListName(payload);
    let syncList;
    try {
        syncList = await client.sync.services(SYNC_SERVICE_SID)
            .syncLists(listName)
            .fetch();
        console.log(`Sync List ${listName} exists. Deleting...`);
        await client.sync.services(SYNC_SERVICE_SID)
            .syncLists(syncList.sid)
            .remove();
        console.log(`Sync List ${listName} deleted.`);
    } catch (err) {
        if (err.status !== 404) {
            console.error('Unexpected error when accessing Sync Service:', err.message);
            throw err;
        }
    }

    console.log(`Creating Sync List ${listName}...`);
    syncList = await client.sync.services(SYNC_SERVICE_SID)
        .syncLists
        .create({uniqueName: listName});
    console.log(`Sync List ${listName} created successfully.`);

    for (let identifier in groupedData) {
        let cleanedIdentifier = identifier.replace(/\W/g, '');
        try {
            console.log(`Creating item for identifier ${cleanedIdentifier}...`);
            await client.sync.services(SYNC_SERVICE_SID)
                .syncLists(syncList.sid)
                .syncListItems
                .create({data: {identifier: cleanedIdentifier, ...groupedData[identifier]}});
            console.log(`Item for identifier ${cleanedIdentifier} created successfully.`);
        } catch (err) {
            console.error(`Error while processing item for identifier ${cleanedIdentifier}:`, err);
        }
    }
}

async function main() {
    console.time("Total Execution Time");
    
    let allGrouped = {};

    for (let identifier of payload.identifiers) {
        if (identifier.startsWith('+')) {
            const dataFromMessaging = await fetchMessagesFromMessagingAPI(identifier);
            const groupedFromMessaging = groupMessagesByMessagingAPI(dataFromMessaging, identifier);
            allGrouped = { ...allGrouped, ...groupedFromMessaging };
        }

        const dataFromConversations = await fetchConversationsFromConversationsAPI(identifier);
        const groupedFromConversations = groupMessagesByConversationsAPI(dataFromConversations);
        allGrouped = { ...allGrouped, ...groupedFromConversations };
    }

    await createOrUpdateSyncList(allGrouped);

    console.timeEnd("Total Execution Time");
}

main().catch(error => {
    console.error('Error:', error);
});

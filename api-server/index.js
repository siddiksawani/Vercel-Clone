const express = require('express');
const { generateSlug } = require('random-word-slugs');
const cors = require('cors');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
const { Server } = require('socket.io');
const Redis = require('ioredis');

const app = express();
const PORT = 9000;

app.use(cors());
app.use(express.json());

const subscriber = new Redis('#redis db url here');
const io = new Server({ cors: '*' });

io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel);
        // Ensuring JSON format when sending data
        socket.emit('message', JSON.stringify({ message: `Joined ${channel}` }));
    });
});

io.listen(9002, () => console.log('Socket Server 9002'));

const ecsClient = new ECSClient({
    region: 'eu-north-1',
    credentials: {
        accessKeyId: '',
        secretAccessKey: ''
    }
});

const config = {
    CLUSTER: '',
    TASK: ''
};

app.post('/project', async (req, res) => {
    const { gitURL, slug } = req.body;
    const projectSlug = slug ? slug : generateSlug();

    const command = new RunTaskCommand({
        cluster: config.CLUSTER,
        taskDefinition: config.TASK,
        launchType: 'FARGATE',
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                subnets: ['subnet-0e36f34ee738b1992', 'subnet-0c24512e1382f2e8a', 'subnet-08728ab0e76c200af'],
                securityGroups: ['sg-09bab7d1404e54b82']
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: 'build-image',
                    environment: [
                        { name: 'GIT_REPOSITORY__URL', value: gitURL },
                        { name: 'PROJECT_ID', value: projectSlug }
                    ]
                }
            ]
        }
    });

    await ecsClient.send(command);

    return res.json({ status: 'queued', data: { projectSlug, url: `http://${projectSlug}.localhost:8000` } });
});

async function initRedisSubscribe() {
    console.log('Subscribed to logs....');
    subscriber.psubscribe('logs:*');
    subscriber.on('pmessage', (pattern, channel, message) => {
        // Ensuring JSON format when sending data
        io.to(channel).emit('message', JSON.stringify({ log: message }));
    });
}

initRedisSubscribe();

app.listen(PORT, () => console.log(`API Server Running on port ${PORT}`));

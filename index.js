const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('ToolFacturer server is running!');
});

// Verify JWT Handler
const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if(!authHeader) {
        return res.status(401).send({message: 'Unauthorized Access'});
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
        if(err) {
            return res.status(403).send({message: 'Forbidden Access'});
        }
        req.decoded = decoded;
        next();
    })
}

// Connect to MongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.bbupgrs.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



async function run () {
    try {
        await client.connect();

        const productCollection = client.db('tool-facturer').collection('products');
        const userCollection = client.db('tool-facturer').collection('users');
        const orderCollection = client.db('tool-facturer').collection('orders');

        // All Products API
        app.get('/products', async (req, res) => {
            const products = await productCollection.find().toArray();
            const orders = await orderCollection.find().toArray();
            products.forEach(product => {
                const orderedProducts = orders.filter(order => order.productName === product.name);
                const orderedQnt = orderedProducts.map(orderedProduct => orderedProduct.orderQuantity);
                const availableQuantity = product.availableQnt - orderedQnt;
                product.availableQnt = availableQuantity; 
            })
            res.send(products); 
        });

        // Single Product API
        app.get('/products/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const result = await productCollection.findOne(query);

            res.send(result);
        })

        // Create User API with JWT
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = {email: email};
            const options = {upsert: true};
            const updateDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

            res.send({result, token});
        });

        // Create Orders API
        app.post('/orders', verifyJWT, async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);

            res.send(result);
        })

        // Get Orders API
        app.get('/orders/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = {userEmail: email};
            const orders = await orderCollection.find(query).toArray();

            res.send(orders);
        })
    }
    finally {

    }
}

run();

app.listen(port, () => {
    console.log('Listening to the port', port);
})
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('ToolFacturer server is running!');
});


// Connect to MongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.bbupgrs.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



async function run () {
    try {
        await client.connect();

        const productCollection = client.db('tool-facturer').collection('products');

        app.get('/products', async (req, res) => {
            const query = {}
            const products = await productCollection.find(query).toArray();
            res.send(products); 
        })
    }
    finally {

    }
}

run();




app.listen(port, () => {
    console.log('Listening to the port', port);
})
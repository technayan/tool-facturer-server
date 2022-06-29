const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
        const reviewCollection = client.db('tool-facturer').collection('reviews');
        const paymentCollection = client.db('tool-facturer').collection('payments');

        // Verify Admin Middleware
        const verifyAdmin = async (req, res, next) => {
            const requesterEmail = req.decoded.email;
            const requesterUser = await userCollection.findOne({email: requesterEmail});
            if(requesterUser.role === 'admin') {
                next();
            } else {
                return res.status(403).send({message: 'Forbidden Access'});
            }
        }

        // Add Product API
        app.post('/products', verifyJWT, verifyAdmin, async (req, res) => {
            const product = req.body;
            const result = await productCollection.insertOne(product);

            res.send(result);
        })

        // All Products API
        app.get('/products', async (req, res) => {
            const products = await productCollection.find().toArray();
            const orders = await orderCollection.find().toArray();
            products.forEach(product => {
                const orderedProducts = orders.filter(order => order.productName === product.name);
                const orderedQnt = orderedProducts.map(orderedProduct => orderedProduct.orderQuantity);
                let restQnt = product.availableQnt;
                orderedQnt.forEach(quantity => {
                    restQnt = restQnt - quantity;
                })
                product.availableQnt = restQnt; 
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

        // Delete Product API
        app.delete('/products/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const result = await productCollection.deleteOne(query);

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

        // Create Order API
        app.post('/orders', verifyJWT, async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);

            res.send(result);
        })

        // Get Orders API
        app.get('/orders',  async (req, res) => {
            const result = await orderCollection.find().toArray();

            res.send(result);
        })

        // Get Orders by Email API
        app.get('/orders/:email', verifyJWT,async (req, res) => {
            const email = req.params.email;
            const query = {userEmail: email};
            const orders = await orderCollection.find(query).toArray();

            res.send(orders);
        })

        // Get Order by id APi
        app.get('/order/:id', verifyJWT, async (req, res) => {
            const orderId = req.params.id;
            const query = {_id: ObjectId(orderId)};
            const result = await orderCollection.findOne(query);

            res.send(result);
        })

        // Update Order Status API
        app.patch('/orders/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = {_id: ObjectId(id)};
            const updateDoc = {
                $set: {status: 'Shipped'},
            };
            const result = await orderCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        // Create Payment Intent API
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const order = req.body;
            const price = order.totalPrice;
            const amount = price * 100;
          
            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
              amount: amount,
              currency: "usd",
              payment_method_types:["card"]
            });
            res.send({clientSecret : paymentIntent.client_secret});
        });

        // Update Order API
        app.patch('/order/:id', verifyJWT, async(req, res) => {
            const id = req.params.id;
            const payment = req.body;
            console.log()
            const filter = {_id: ObjectId(id)};
            const updateDoc = {
                $set: {
                    status: 'Paid',
                    transactionId: payment.transactionId
                }
            }
            const result = await paymentCollection.insertOne(payment);
            const updatedOrder = await orderCollection.updateOne(filter, updateDoc);
            
            res.send(updatedOrder); 
        })

        // Delete Order API
        app.delete('/orders/:id', verifyJWT, async (req, res) => {
            const orderId = req.params.id;
            const userEmail = req.decoded.email;
            const query = {_id: ObjectId(orderId), userEmail: userEmail};
            const result = await orderCollection.deleteOne(query);

            res.send(result);
        })

        // Delete Order by Admin API
        app.delete('/orders/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const orderId = req.params.id;
            const query = {_id: ObjectId(orderId)};
            const result = await orderCollection.deleteOne(query);

            res.send(result);
        })

        // Post Review API
        app.post('/reviews', verifyJWT, async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);

            res.send(result);
        })

        // Review API
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray();

            res.send(result);
        })

        // Users API
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();

            res.send(result);
        })

        // Delete User API
        app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const userId = req.params.id;
            const query = {_id: ObjectId(userId)};
            const result = await userCollection.deleteOne(query);

            res.send(result);
        })

        // Make User Admin API
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = {email: email};
            const updateDoc = {
                $set: {role: 'admin'},
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        //  Check User Role API
        app.get('/users/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = {email: email};
            const result = await userCollection.findOne(query);
            const isAdmin = result?.role === 'admin';
            res.send({admin: isAdmin});
        })
    }
    finally {

    }
}

run();

app.listen(port, () => {
    console.log('Listening to the port', port);
})
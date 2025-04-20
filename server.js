const express = require('express');
const logger = require('morgan');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const { createServer } = require('node:http');
const bodyParser = require('body-parser');

const app = express();
const server = createServer(app);

// --- Configuraciones iniciales ---
app.use(cors({
  origin: 'https://cerk.netlify.app/', 
  methods: ['GET', 'POST'],
}));
app.use(logger('dev'));
app.use(bodyParser.json()); // ← Para recibir JSON desde el frontend

const io = new Server(server, {
  cors: {
    origin: 'https://cerk.netlify.app/',
    methods: ['GET', 'POST'],
  },
});

// --- Archivo de usuarios ---
const USERS_DB = path.join(__dirname, 'users.json');

// Leer usuarios desde el archivo JSON
function readUsers() {
  if (!fs.existsSync(USERS_DB)) return [];
  return JSON.parse(fs.readFileSync(USERS_DB, 'utf-8'));
}

// Guardar usuarios en el archivo
function saveUsers(users) {
  fs.writeFileSync(USERS_DB, JSON.stringify(users, null, 2));
}

// --- Haversine para distancia geográfica ---
const RADIUS = 1; // km
function haversineDistance(coord1, coord2) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(coord2.latitude - coord1.latitude);
  const dLon = toRad(coord2.longitude - coord1.longitude);
  const lat1 = toRad(coord1.latitude);
  const lat2 = toRad(coord2.latitude);

  const a = Math.sin(dLat / 2) ** 2 +
            Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- WebSocket logic ---
io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);
  
    socket.on('disconnect', () => {
        const users = readUsers();
        const index = users.findIndex(u => u.id === socket.id);
      
        if (index !== -1) {
          users[index].connected = false;
      
          if ('id' in users[index]) {
            delete users[index].id;
          }
      
          if ('location' in users[index]) {
            delete users[index].location;
          }
      
          saveUsers(users);
        }
      });
      
  
    socket.on('user location', ({ username, location }) => {
      const users = readUsers();
      const index = users.findIndex(u => u.username === username);
  
      if (index !== -1) {
        // Actualizar solo si el usuario existe
        users[index].id = socket.id;
        users[index].location = location;
        users[index].connected = true;
        saveUsers(users);
      } else {
        console.warn(`Usuario desconocido "${username}" intentó enviar ubicación`);
      }
    });
  
    socket.on('chat message', (msg) => {
      io.emit('chat message', msg);
    });
  
    socket.on('get nearby users', () => {
      const users = readUsers(); 
      const currentUser = users.find(u => u.id === socket.id);    
      if (!currentUser || !currentUser.location) return;
  
      const nearby = users.filter((u) => {
        return u.id !== socket.id && haversineDistance(currentUser.location, u.location) <= RADIUS;
      });
  
      socket.emit('nearby users', nearby);
    });
  });
  

// --- Rutas HTTP REST (registro y login) ---

// Registro de usuario
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  const currentUsers = readUsers();

  if (currentUsers.some(u => u.username === username)) {
    return res.status(400).json({ error: 'El nombre de usuario ya existe' });
  }

  currentUsers.push({ username, password }); // puedes agregar location después
  saveUsers(currentUsers);

  return res.status(200).json({ message: 'Usuario creado exitosamente' });
});

// Inicio de sesión
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const currentUsers = readUsers();

  const user = currentUsers.find(u => u.username === username);
  if (!user) {
    return res.status(400).json({ error: 'Usuario no encontrado' });
  }

  if (user.password !== password) {
    return res.status(400).json({ error: 'Contraseña incorrecta' });
  }

  return res.status(200).json({ message: 'Login exitoso' });
});

// --- Servir HTML principal si alguien accede directo ---
app.get('/', (req, res) => {
  res.sendFile(process.cwd() + 'https://cerk.netlify.app/');
});

// --- Iniciar servidor ---
server.listen(3000, () => {
  console.log('🚀 Servidor corriendo en https://cerk-backend.onrender.com/');
});

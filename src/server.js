'use strict';
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const server = createApp().listen(PORT, () => {
  console.log(`💸 MyApp Gastos corriendo en http://localhost:${PORT}`);
  console.log('   Deja esta ventana abierta mientras uses la app. Para detenerla: Ctrl + C');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ El puerto ${PORT} ya está en uso. Cierra la otra ventana donde corre la app o usa otro puerto: PORT=3001 npm start`);
  } else {
    console.error('❌ No se pudo iniciar el servidor:', err.message);
  }
  process.exitCode = 1;
});

process.on('SIGINT', () => {
  console.log('\n👋 Servidor detenido (Ctrl + C).');
  process.exit(0);
});

process.on('exit', code => {
  if (code !== 0) console.error(`⚠️ El servidor se cerró (código ${code}).`);
});

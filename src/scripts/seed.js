const sequelize = require("../config/database");
const Category = require("../models/Category");
const Product = require("../models/Product");
const Movement = require("../models/Movement");
const generateProductCode = require("../utils/generateProductCode");

const NOMBRES_CATEGORIAS = [
  "Cuadernos",
  "Escritura",
  "Arte",
  "Oficina",
  "Escolar",
  "Accesorios",
  "Papel",
  "Varios",
];

const DATOS_PRODUCTOS = [
  { nombre: "Cuaderno espiral", cantidad: 25, precio: 45.0, categoria: "Cuadernos" },
  { nombre: "Cuaderno universitario", cantidad: 15, precio: 55.0, categoria: "Cuadernos" },
  { nombre: "Bolígrafo azul", cantidad: 60, precio: 12.0, categoria: "Escritura" },
  { nombre: "Bolígrafo negro", cantidad: 45, precio: 12.0, categoria: "Escritura" },
  { nombre: "Lapicero gel", cantidad: 8, precio: 20.0, categoria: "Escritura", stock_minimo: 10 },
  { nombre: "Lápices de colores", cantidad: 18, precio: 35.0, categoria: "Arte" },
  { nombre: "Témperas", cantidad: 3, precio: 60.0, categoria: "Arte", stock_minimo: 5 },
  { nombre: "Notas adhesivas", cantidad: 35, precio: 25.0, categoria: "Oficina" },
  { nombre: "Clips metálicos", cantidad: 50, precio: 15.0, categoria: "Oficina" },
  { nombre: "Regla 30cm", cantidad: 12, precio: 18.0, categoria: "Escolar" },
  { nombre: "Sacapuntas", cantidad: 4, precio: 8.0, categoria: "Escolar", stock_minimo: 5 },
  { nombre: "Tijeras escolares", cantidad: 0, precio: 30.0, categoria: "Accesorios" },
  { nombre: "Borrador blanco", cantidad: 40, precio: 6.0, categoria: "Accesorios" },
  { nombre: "Resma papel bond", cantidad: 10, precio: 90.0, categoria: "Papel" },
];

// producto, tipo, cantidad, fecha (YYYY-MM-DD), motivo
const DATOS_MOVIMIENTOS = [
  ["Cuaderno espiral", "entrada", 30, "2026-06-10", "Compra a proveedor"],
  ["Cuaderno espiral", "salida", 5, "2026-07-05", "Venta"],
  ["Cuaderno espiral", "entrada", 10, "2026-08-14", "Compra a proveedor"],
  ["Cuaderno espiral", "salida", 10, "2026-09-05", "Venta"],
  ["Cuaderno universitario", "entrada", 20, "2026-07-12", "Compra a proveedor"],
  ["Cuaderno universitario", "salida", 5, "2026-08-05", "Venta"],
  ["Bolígrafo azul", "entrada", 80, "2026-06-12", "Compra a proveedor"],
  ["Bolígrafo azul", "salida", 30, "2026-07-08", "Venta"],
  ["Bolígrafo azul", "salida", 20, "2026-07-20", "Venta"],
  ["Bolígrafo azul", "entrada", 30, "2026-09-02", "Compra a proveedor"],
  ["Bolígrafo negro", "entrada", 60, "2026-06-06", "Compra a proveedor"],
  ["Bolígrafo negro", "salida", 15, "2026-08-05", "Venta"],
  ["Lapicero gel", "entrada", 20, "2026-06-15", "Compra a proveedor"],
  ["Lapicero gel", "salida", 7, "2026-07-10", "Venta"],
  ["Lapicero gel", "salida", 5, "2026-08-12", "Venta"],
  ["Témperas", "entrada", 12, "2026-06-05", "Compra a proveedor"],
  ["Témperas", "salida", 5, "2026-07-18", "Merma"],
  ["Témperas", "salida", 4, "2026-08-25", "Merma"],
  ["Sacapuntas", "entrada", 10, "2026-07-02", "Compra a proveedor"],
  ["Sacapuntas", "salida", 6, "2026-08-20", "Venta"],
  ["Clips metálicos", "entrada", 50, "2026-06-25", "Compra a proveedor"],
  ["Clips metálicos", "entrada", 15, "2026-07-15", "Ajuste de inventario"],
  ["Clips metálicos", "salida", 15, "2026-08-20", "Venta"],
  ["Tijeras escolares", "entrada", 12, "2026-06-30", "Compra a proveedor"],
  ["Tijeras escolares", "salida", 8, "2026-07-25", "Venta"],
  ["Tijeras escolares", "salida", 4, "2026-08-28", "Venta"],
  ["Resma papel bond", "entrada", 15, "2026-08-03", "Compra a proveedor"],
  ["Resma papel bond", "salida", 5, "2026-09-01", "Venta"],
];

async function run() {
  await sequelize.authenticate();

  await Movement.destroy({ where: {} });
  await Product.destroy({ where: {} });
  await Category.destroy({ where: {} });

  const categories = {};
  for (const nombre of NOMBRES_CATEGORIAS) {
    const cat = await Category.create({ nombre });
    categories[nombre] = cat;
  }

  const products = {};
  for (const datos of DATOS_PRODUCTOS) {
    const codigo = await generateProductCode(categories[datos.categoria].id);
    const product = await Product.create({
      nombre: datos.nombre,
      codigo,
      cantidad: datos.cantidad,
      precio: datos.precio,
      stock_minimo: datos.stock_minimo ?? 5,
      categoria_id: categories[datos.categoria].id,
    });
    products[datos.nombre] = product;
  }

  for (const [nombre, tipo, cantidad, fecha, motivo] of DATOS_MOVIMIENTOS) {
    await Movement.create({
      producto_id: products[nombre].id,
      tipo,
      cantidad,
      motivo,
      created_at: new Date(`${fecha}T09:00:00`),
    });
  }

  const totalCategorias = await Category.count();
  const totalProductos = await Product.count();
  const totalMovimientos = await Movement.count();

  console.log(
    `Seed completado: ${totalCategorias} categorías, ${totalProductos} productos, ${totalMovimientos} movimientos.`
  );

  await sequelize.close();
}

run().catch(async (err) => {
  console.error("Error en el seed:", err);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
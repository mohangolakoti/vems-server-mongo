const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const { format } = require('date-fns');
const router = require('./routes/route');
const dotEnv = require('dotenv');
const app = express();
dotEnv.config();

// Mongoose model (this is the MongoDB schema, assuming the schema structure)
const EnergyData = require('./models/energyData'); // Import the EnergyData schema model

app.use(cors());
app.use(bodyParser.json());

const port = process.env.PORT || 8080;

// MongoDB connection setup
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("Connected to MongoDB");
}).catch((error) => {
  console.error("Error connecting to MongoDB:", error);
});

let initialEnergyValue = null;
let firstStoredEnergyValue = null;
let isFirstDataStoredToday = false;

// Routes are coming from Routes folder route.js
app.use('/api', router);

async function initializeInitialEnergyValue() {
  try {
    console.log("Initializing initial energy value...");

    const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
    const today = format(new Date(), 'yyyy-MM-dd');

    const previousDayData = await EnergyData.findOne({
      timestamp: {
        $gte: new Date(yesterday),
        $lt: new Date(today)
      }
    }).sort({ timestamp: -1 });

    if (previousDayData) {
      initialEnergyValue = {
        meter70: previousDayData.TotalNet_KWH_meter_70,
        meter40: previousDayData.TotalNet_KWH_meter_40,
        meter69: previousDayData.TotalNet_KWH_meter_69,
        meter41: previousDayData.TotalNet_KWH_meter_41,
      };
      console.log("Initial energy value stored from previous day:", initialEnergyValue);
    } else {
      console.log("No data found for the previous day. Fetching today's first record.");
      const todayFirstRecord = await EnergyData.findOne({
        timestamp: {
          $gte: new Date(today)
        }
      }).sort({ timestamp: 1 });

      if (todayFirstRecord) {
        initialEnergyValue = {
          meter70: todayFirstRecord.TotalNet_KWH_meter_70,
          meter40: todayFirstRecord.TotalNet_KWH_meter_40,
          meter69: todayFirstRecord.TotalNet_KWH_meter_69,
          meter41: todayFirstRecord.TotalNet_KWH_meter_41,
        };
        console.log("Initial energy value set to today's first record:", initialEnergyValue);
      } else {
        console.log("No data found for today yet.");
      }
    }
  } catch (error) {
    console.error("Error initializing initial energy value:", error);
  }
}

async function fetchDataAndStore() {
  try {
    console.log("Fetching and storing sensor data...");
    const response = await axios.get("http://ec2-3-111-31-138.ap-south-1.compute.amazonaws.com:4000/api/sensordata");
    const newData = response.data[0];

    if (initialEnergyValue === null) {
      initialEnergyValue = {
        meter70: newData.TotalNet_KWH_meter_70,
        meter40: newData.TotalNet_KWH_meter_40,
        meter69: newData.TotalNet_KWH_meter_69,
        meter41: newData.TotalNet_KWH_meter_41,
      };
      console.log("Setting initial energy value to the current value:", initialEnergyValue);
    }

    const energyConsumption = {
      meter70: newData.TotalNet_KWH_meter_70 - initialEnergyValue.meter70,
      meter40: newData.TotalNet_KWH_meter_40 - initialEnergyValue.meter40,
      meter69: newData.TotalNet_KWH_meter_69 - initialEnergyValue.meter69,
      meter41: newData.TotalNet_KWH_meter_41 - initialEnergyValue.meter41,
    };

    const newEnergyData = new EnergyData({
      timestamp: new Date(),
      Total_KW_meter_70: newData.Total_KW_meter_70,
      TotalNet_KWH_meter_70: newData.TotalNet_KWH_meter_70,
      Total_KVA_meter_70: newData.Total_KVA_meter_70,
      Avg_PF_meter_70: newData.Avg_PF_meter_70,
      TotalNet_KVAH_meter_70: newData.TotalNet_KVAH_meter_70,

      Total_KW_meter_40: newData.Total_KW_meter_40,
      TotalNet_KWH_meter_40: newData.TotalNet_KWH_meter_40,
      Total_KVA_meter_40: newData.Total_KVA_meter_40,
      Avg_PF_meter_40: newData.Avg_PF_meter_40,
      TotalNet_KVAH_meter_40: newData.TotalNet_KVAH_meter_40,

      Total_KW_meter_69: newData.Total_KW_meter_69,
      TotalNet_KWH_meter_69: newData.TotalNet_KWH_meter_69,
      Total_KVA_meter_69: newData.Total_KVA_meter_69,
      Avg_PF_meter_69: newData.Avg_PF_meter_69,
      TotalNet_KVAH_meter_69: newData.TotalNet_KVAH_meter_69,

      Total_KW_meter_41: newData.Total_KW_meter_41,
      TotalNet_KWH_meter_41: newData.TotalNet_KWH_meter_41,
      Total_KVA_meter_41: newData.Total_KVA_meter_41,
      Avg_PF_meter_41: newData.Avg_PF_meter_41,
      TotalNet_KVAH_meter_41: newData.TotalNet_KVAH_meter_41,

      energy_consumption_meter_70: energyConsumption.meter70,
      energy_consumption_meter_40: energyConsumption.meter40,
      energy_consumption_meter_69: energyConsumption.meter69,
      energy_consumption_meter_41: energyConsumption.meter41
    });

    await newEnergyData.save();
    console.log("Sensor data stored successfully:", newEnergyData);

    if (!isFirstDataStoredToday) {
      firstStoredEnergyValue = {
        meter70: newData.TotalNet_KWH_meter_70,
        meter40: newData.TotalNet_KWH_meter_40,
        meter69: newData.TotalNet_KWH_meter_69,
        meter41: newData.TotalNet_KWH_meter_41,
      };
      isFirstDataStoredToday = true;
      console.log("First stored energy value for today:", firstStoredEnergyValue);
    }

    const currentDate = format(new Date(), 'yyyy-MM-dd');
    const fileName = `VITB_${currentDate}.txt`;
    const filePath = path.join(__dirname, "VIT-Data", fileName);

    appendDataToFile(newData, filePath);
  } catch (error) {
    console.error("Error fetching and storing sensor data:", error);
  }
}

async function appendDataToFile(data, filePath) {
  try {
    console.log("Appending data to file:", filePath);
    const fileContent = `${format(new Date(), 'yyyy-MM-dd HH:mm:ss')},${data.Total_KW_meter_70},${data.TotalNet_KWH_meter_70},${data.Total_KVA_meter_70},${data.Avg_PF_meter_70},${data.TotalNet_KVAH_meter_70},${data.Total_KW_meter_40},${data.TotalNet_KWH_meter_40},${data.Total_KVA_meter_40},${data.Avg_PF_meter_40},${data.TotalNet_KVAH_meter_40},${data.Total_KW_meter_69},${data.TotalNet_KWH_meter_69},${data.Total_KVA_meter_69},${data.Avg_PF_meter_69},${data.TotalNet_KVAH_meter_69},${data.Total_KW_meter_41},${data.TotalNet_KWH_meter_41},${data.Total_KVA_meter_41},${data.Avg_PF_meter_41},${data.TotalNet_KVAH_meter_41}\n`;
    fs.appendFile(filePath, fileContent, (error) => {
      if (error) {
        console.error("Error appending data to file:", error);
      } else {
        console.log("Data appended to file successfully:", filePath);
      }
    });
  } catch (error) {
    console.error("Error appending data to file:", error);
  }
}

setInterval(initializeInitialEnergyValue, 10 * 60000);
setInterval(fetchDataAndStore, 10 * 60000);

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const { format, subDays, startOfDay, endOfDay, addSeconds } = require('date-fns');
const dotEnv = require('dotenv');
dotEnv.config();
app.use(cors());
app.use(bodyParser.json());

const EnergyData = require('../models/energyData'); // Assuming EnergyData model is exported correctly

const sensorData = async (req, res) => {
    try {
        const latestData = await EnergyData.findOne().sort({ timestamp: -1 });
        res.json(latestData);
    } catch (error) {
        res.status(500).json({ error: "Error fetching latest sensor data" });
    }
};

const energyConsumption = async (req, res) => {
    try {
        const dates = [
            subDays(new Date(), 6),
            subDays(new Date(), 5),
            subDays(new Date(), 4),
            subDays(new Date(), 3),
            subDays(new Date(), 2),
            subDays(new Date(), 1),
            new Date()
        ];

        const queries = dates.map(date => ({
            timestamp: {
                $gte: startOfDay(date),
                $lte: endOfDay(date)
            }
        }));

        const energyData = await EnergyData.find({ $or: queries })
            .sort({ timestamp: -1 })
            .limit(7)
            .select('TotalNet_KWH_meter_1 timestamp');

        const data = energyData.map(row => ({
            date: format(row.timestamp, 'yyyy-MM-dd'),
            energy: row.TotalNet_KWH_meter_1
        }));

        res.status(200).json(data);
    } catch (error) {
        console.error("Error fetching energy values:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

const realTimeGraph = async (req, res) => {
    const today = new Date();
    const start = startOfDay(today);
    const end = today;

    try {
        const data = await EnergyData.find({
            timestamp: { $gte: start, $lte: end }
        }).sort({ timestamp: 1 });

        res.json(data);
    } catch (error) {
        console.error('Error fetching power data:', error);
        res.status(500).send('Error fetching power data');
    }
};

const dailyWiseGraph = async (req, res) => {
    const date = req.params.date;

    // Convert to IST by adding 5 hours 30 minutes
    const startUTC = startOfDay(new Date(date));
    const endUTC = endOfDay(new Date(date));

    const startIST = addSeconds(startUTC, 19800);
    const endIST = addSeconds(endUTC, 19800);

    try {
        const data = await EnergyData.find({
            timestamp: { $gte: startIST, $lte: endIST }
        }).sort({ timestamp: 1 });

        res.json(data);
    } catch (error) {
        console.error('Error fetching power data:', error);
        res.status(500).send('Error fetching power data');
    }
};

const prevDayEnergy = async (req, res) => {
    try {
        const yesterday = subDays(new Date(), 1);
        const today = new Date();

        const previousDayRecord = await EnergyData.findOne({
            timestamp: {
                $gte: startOfDay(yesterday),
                $lte: endOfDay(yesterday)
            }
        }).sort({ timestamp: -1 });

        const todayFirstRecord = await EnergyData.findOne({
            timestamp: { $gte: startOfDay(today) }
        }).sort({ timestamp: 1 });

        let initialEnergyValues = {
            meter_70: null,
            meter_40: null,
            meter_69: null,
            meter_41: null,
        };

        if (previousDayRecord) {
            initialEnergyValues = {
                meter_70: previousDayRecord.TotalNet_KWH_meter_70,
                meter_40: previousDayRecord.TotalNet_KWH_meter_40,
                meter_69: previousDayRecord.TotalNet_KWH_meter_69,
                meter_41: previousDayRecord.TotalNet_KWH_meter_41,
            };
        } else if (todayFirstRecord) {
            initialEnergyValues = {
                meter_70: todayFirstRecord.TotalNet_KWH_meter_70,
                meter_40: todayFirstRecord.TotalNet_KWH_meter_40,
                meter_69: todayFirstRecord.TotalNet_KWH_meter_69,
                meter_41: todayFirstRecord.TotalNet_KWH_meter_41,
            };
        }

        res.status(200).json({ initialEnergyValues });
    } catch (error) {
        console.error("Error fetching previous day's energy values:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

const getHighestKva = async (req, res) => {
    try {
        const today = new Date();

        const highestKvaToday = await EnergyData.aggregate([
            {
                $match: {
                    timestamp: {
                        $gte: startOfDay(today),
                        $lte: today
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    highest_kva_today: { $max: { $add: ["$Total_KVA_meter_70", "$Total_KVA_meter_40", "$Total_KVA_meter_69"] } }
                }
            }
        ]);

        const highestKvaMonth = await EnergyData.aggregate([
            {
                $match: {
                    timestamp: {
                        $gte: startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)),
                        $lte: today
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    highest_kva_month: { $max: { $add: ["$Total_KVA_meter_70", "$Total_KVA_meter_40", "$Total_KVA_meter_69"] } }
                }
            }
        ]);

        res.status(200).json({
            highestKvaToday: highestKvaToday[0]?.highest_kva_today || 0,
            highestKvaMonth: highestKvaMonth[0]?.highest_kva_month || 0,
        });
    } catch (error) {
        console.error('Error fetching highest KVA values:', error);
        res.status(500).json({ error: "Internal server error" });
    }
};

const sensorDataByDate = async (req, res) => {
    const { date } = req.params;

    try {
        const data = await EnergyData.find({
            timestamp: {
                $gte: startOfDay(new Date(date)),
                $lte: endOfDay(new Date(date))
            }
        });

        if (data.length === 0) {
            return res.status(404).json({ message: "No data found for the selected date." });
        }

        res.json(data);
    } catch (error) {
        console.error('Error fetching sensor data:', error);
        res.status(500).json({ error: "Error fetching sensor data" });
    }
};

module.exports = { sensorData, realTimeGraph, dailyWiseGraph, prevDayEnergy, energyConsumption, getHighestKva, sensorDataByDate };

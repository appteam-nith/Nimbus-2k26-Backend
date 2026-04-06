const sendResponse = (res, status, message, data = null, meta = null) => {
  const payload = {
    success: status >= 200 && status < 300,
    status,
    message,
    timestamp: new Date().toISOString(),
    data,
  };

  if (meta !== null) payload.meta = meta;

  return res.status(status).json(payload);
};


export { sendResponse };

// usage Example:
// instead of 
// res.status(200).json({ ... })     
// use
// return sendResponse(res, 200, "Trade executed", trade);
//  meta is any extra info if needed






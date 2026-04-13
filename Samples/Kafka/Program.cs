using System.Reflection;
using MassTransit;
using Muonroi.BuildingBlock.External;
using Muonroi.BuildingBlock.External.DI;
using Muonroi.BuildingBlock.External.Logging;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
Assembly assembly = Assembly.GetExecutingAssembly();
ConfigurationManager configuration = builder.Configuration;

builder.AddAppConfiguration();
builder.AddAutofacConfiguration();
builder.ConfigureSerilog();

builder.Services.AddMessageBus(configuration, assembly);

WebApplication app = builder.Build();
app.MapGet("/", () => "Kafka sample");

await app.RunAsync();
